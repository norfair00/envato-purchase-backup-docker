const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');

dotenvExpand.expand(dotenv.config());

const fs = require('fs');
const path = require('path');
const os = require('os');

const chalk = require('chalk');

const Cloudflare = require('cloudflare');
const { S3Client, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const bent = require('bent');
const PQueue = require('p-queue').default

const TEMP_DIR = path.join(os.tmpdir(), 'envato-downloads');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

async function fileExistsR2(fileName) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: fileName }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound') return false;
    throw err;
  }
}

const client = new Cloudflare({
  apiToken: process.env.CF_API_KEY,
});

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const getEnvato = bent('https://api.envato.com/v3/market', 'json', { 'Authorization': `Bearer ${process.env.ENVATO_PERSONAL_TOKEN}` });
const postEnvato = bent('POST', 'https://api.envato.com/v3/market', 'json', { 'Authorization': `Bearer ${process.env.ENVATO_PERSONAL_TOKEN}` });
const getStream = bent('GET', 200);

const queue = new PQueue( { concurrency: parseInt(process.env.CONCURRENCY) });
const getBuffer = bent('buffer');
const { PassThrough } = require('stream');

const queryD1 = async (sql, params = [], single = false) => {
    const result = await client.d1.database.query(process.env.CF_D1_ID, {
        account_id: process.env.CF_ACCOUNT_ID,
        sql,
        params
    });

    if (!result || !result.result) return [];

    return single ? result.result[0] : result.result;
};

async function downloadAndUpload(purchase, newer = false) {
    console.log(`${chalk.gray('[')}${chalk.cyan('QUEUE')}${chalk.gray(']')} ${chalk.yellow('Pending')}${chalk.gray(':')} ${queue.size} / ${chalk.greenBright('Running')}${chalk.gray(':')} ${queue.pending}`);

    const params1 = new URLSearchParams({
        id: purchase.item.id
    });

    const item = await getEnvato(`/catalog/item?${params1.toString()}`);
    const item_url = new URL(item.url);

    const baseName = `${item_url.pathname.split("/")[2]}.zip`;
    const remotePath = `${item.site.split(".")[0]}/${item.classification.split("/")[0]}/${baseName}`;
    const tempPath = path.join(TEMP_DIR, baseName);


    console.log(`${chalk.gray('[')}${chalk.cyan('DOWNLOAD')}${chalk.gray(']')} ${chalk.magenta('Get')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`);

    const params = new URLSearchParams({
        item_id: purchase.item.id
    });

    getEnvato(`/buyer/download?${params.toString()}`).then(async (dl) => {
        try {
            console.log(`${chalk.gray('[')}${chalk.cyan('DOWNLOAD')}${chalk.gray(']')} ${chalk.blue('Downloading')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`);
            const response = await getStream(dl.download_url);

            const fileStream = fs.createWriteStream(tempPath);
            await new Promise((resolve, reject) => {
                response.pipe(fileStream);
                response.on('error', reject);
                fileStream.on('finish', resolve);
            });

            const fileSize = fs.statSync(tempPath).size;

            console.log(`${chalk.gray('[')}${chalk.cyan('DOWNLOAD')}${chalk.gray(']')} ${chalk.green('Downloaded')} ${baseName} (${(fileSize / 1024 / 1024).toFixed(2)} Mo)`);

            const uploadStream = fs.createReadStream(tempPath);
            await s3.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: remotePath,
                Body: uploadStream,
            }));

            console.log(`${chalk.gray('[')}${chalk.cyan('DOWNLOAD')}${chalk.gray(']')} ${chalk.green('Uploaded')} ${remotePath}`);

            if (newer) {
                await queryD1(`insert into ${process.env.CF_D1_TABLE} (id, name, url, updated_at) values (?, ?, ?, ?)`, [item.id, item.name, item.url, item.updated_at], true)
                    .then(async (res) => { console.log(`${chalk.gray('[')}${chalk.cyan('SQL')}${chalk.gray(']')} ${chalk.green('New')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`); })
                    .catch(err => { console.log(err.message) });
            } else {
                await queryD1(`update ${process.env.CF_D1_TABLE} set updated_at = ? where id = ?`, [item.updated_at, item.id], true)
                    .then(async (res) => { console.log(`${chalk.gray('[')}${chalk.cyan('SQL')}${chalk.gray(']')} ${chalk.yellow('Update')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`); })
                    .catch(err => { console.log(err.message) });
            }
        } catch (err) {
            console.error(`${chalk.gray('[')}${chalk.cyan('DOWNLOAD')}${chalk.gray(']')} ${chalk.red('Error')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`, err.message);
        } finally {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);

                console.log(`${chalk.gray('[')}${chalk.cyan('DOWNLOAD')}${chalk.gray(']')} ${chalk.yellow('Temp Delete')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`);
            }
        }
    }).catch(err => {
        console.error(`${chalk.gray('[')}${chalk.cyan('DOWNLOAD')}${chalk.gray(']')} ${chalk.red('Error')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`, err.message);
    });
}

(async () => {
    const purchasesRequest = await getEnvato('/buyer/list-purchases');

    const purchases = purchasesRequest.results;

    const purchasesTable = await queryD1(`SELECT * FROM ${process.env.CF_D1_TABLE}`, [], true);

    for (const purchase of purchases) {
        const purchaseRow = purchasesTable.results?.find((p) => p.id === purchase.item.id);
        if (purchaseRow) {
            console.log(`${chalk.gray('[')}${chalk.cyan('PURCHASE')}${chalk.gray(']')} ${chalk.yellow('Check')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`);
            if (purchaseRow.updated_at !== purchase.item.updated_at) {
                console.log(`${chalk.gray('[')}${chalk.cyan('PURCHASE')}${chalk.gray(']')} ${chalk.green('Update')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`);
                queue.add(() => downloadAndUpload(purchase));
                //console.log(`${chalk.gray('[')}${chalk.cyan('QUEUE')}${chalk.gray(']')} ${chalk.yellow('Pending')}${chalk.gray(':')} ${queue.size} / ${chalk.greenBright('Running')}${chalk.gray(':')} ${queue.pending}`);
            } else {
                console.log(`${chalk.gray('[')}${chalk.cyan('PURCHASE')}${chalk.gray(']')} ${chalk.gray('Skip')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`);
            }
        } else {
            console.log(`${chalk.gray('[')}${chalk.cyan('PURCHASE')}${chalk.gray(']')} ${chalk.redBright('Purchase')} ${purchase.item.name} ${chalk.gray('(')}${chalk.blue(purchase.item.id)}${chalk.gray(')')}`);
            queue.add(() => downloadAndUpload(purchase, true));
            //console.log(`${chalk.gray('[')}${chalk.cyan('QUEUE')}${chalk.gray(']')} ${chalk.yellow('Pending')}${chalk.gray(':')} ${queue.size} / ${chalk.greenBright('Running')}${chalk.gray(':')} ${queue.pending}`);
        }
    }
})();