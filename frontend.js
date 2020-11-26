const https = require("https");
const fs = require("fs");
const Path = require('path');
const zlib = require("zlib");
const { spawn } = require('child_process');

const OAUTH_TOKEN = process.env.OAUTH_TOKEN;
const log = {
    _log : function (type, str, ...params) {
        console.log(type, new Date().toISOString(), str, ...params);
    },
    debug : function(str, ...params) {
        this._log("DEBUG", str, ...params);
    }
}

/**
 * 
 * @param {*} url 
 * @returns {Promise<any>} promise
 */
async function readUrl(url) {
    return new Promise((resolve, reject) => {
        https.request(url, { method:"GET", headers : {
            "Authorization" : `token ${OAUTH_TOKEN}`,
            "User-Agent": "Transerve-PwC"
        }}, res => {
            log.debug("Response status code ", res.statusCode);
            const success = res.statusCode >= 200 && res.statusCode < 300;
            let body = "";
            res.on('data', (chunk) => {
                body+= chunk;
              });
              res.on('end', () => {
                  if (success) {
                      return resolve(JSON.parse(body));
                  } else {
                      return reject(new Error(body));
                  }
              });            
        }).on("error", e => {
            return reject(e);
        }).end();
    });
}

/**
 * 
 * @param {*} url 
 * @returns {Promise<any>} promise
 */
async function downloadFile(url, path) {
    return new Promise((resolve, reject) => {
        https.request(url, { method:"GET", headers : {
            "Authorization" : `token ${OAUTH_TOKEN}`,
            "User-Agent": "Transerve-PwC"
        }}, res => {
            log.debug("Response status code ", res.statusCode);
            const isRedirect = res.statusCode >= 302;
            const success = res.statusCode >= 200 && res.statusCode < 300;
            if (isRedirect) {
                log.debug("Redirecting to ", res.headers.location);
                return downloadFile(res.headers.location, path).then(resolve);
            }
            if (success) {
                const fileStream = fs.createWriteStream(path);
                    res.pipe(fileStream);
                res.on('end', () => {
                    log.debug("res.pipe end");
                    return resolve("success");
                })
            } else {
            let body = "";
            res.on('data', (chunk) => {
                body+= chunk;
              });
              res.on('end', () => {
                  if (success) {
                      return resolve(JSON.parse(body));
                  } else {
                      return reject(new Error(body));
                  }
              });     
            }       
        }).on("error", e => {
            return reject(e);
        }).end();
    });
}

function deleteFolderRecursiveSync(path) {
    if (fs.existsSync(path)) {
      fs.readdirSync(path).forEach((file, index) => {
        const curPath = Path.join(path, file);
        if (fs.lstatSync(curPath).isDirectory()) { // recurse
          deleteFolderRecursiveSync(curPath);
        } else { // delete file
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(path);
    }
  };

async function backupAndExtract(generatedZipFile, destDirectory, bakFile, zipFilePath) {

    return new Promise((resolve, reject) => { 
        
        //Remove bak file.
        try {
            fs.unlinkSync(bakFile);
            log.debug("Removed .bak file successfully", bakFile);
        } catch (err) {
            log.debug("Could not delete .bak file", bakFile);
        }

        //Rename existing zip file as .bak
        try {
            fs.renameSync(zipFilePath, bakFile);
            log.debug("Moved .zip file to .bak successfully", zipFilePath, bakFile);
        } catch (e) {
            log.debug("Could not move .zip file to .bak", zipFilePath, bakFile);
        }

        //Recursively delete build folder
        try {
            deleteFolderRecursiveSync(destDirectory);
            log.debug("Recursively deleted build folder", destDirectory);
        } catch (e) {
            log.debug("Could not delete build folder", destDirectory);
        }

        //unzip downloaded file as build folder.
        const ls = spawn('unzip', ["-q", generatedZipFile, "-d", destDirectory]);
        
        ls.stdout.on('data', (data) => {
          log.debug(`stdout: ${data}`);
        });
        
        ls.stderr.on('data', (data) => {
          console.error(`stderr: ${data}`);
          reject(new Error("Could not unzip ", generatedZipFile));
        });
        
        ls.on('close', (code) => {
          log.debug("Downloaded zip file expanded", generatedZipFile);
          resolve();
        });
    }).then(_ => {
        try {
            fs.renameSync(generatedZipFile, zipFilePath);
            log.debug("Moved build.zip to final zip file path", generatedZipFile, zipFilePath);
        } catch (e) {
            log.debug("Could not move build.zip to final zip file path", generatedZipFile, zipFilePath);
        }
    })
}

async function sleep(t = 5) {
    return new Promise(resolve => setTimeout(resolve, t * 1000));
}

async function main(owner = "Transerve-PwC", repo = "frontend", buildType = 'citizen') {
    try{
        log.debug(`Waiting for 5 seconds`);
        await sleep();
        const workFlowRunURL = `https://api.github.com/repos/${owner}/${repo}/actions/runs`
        const {workflow_runs} = await readUrl(workFlowRunURL);
        const latestWorkflow = workflow_runs[0];
        log.debug(`Proceeding with deployment for latest workflow ${latestWorkflow.id} with status ${latestWorkflow.status}`);
        
        const artifact_url = workflow_runs[0].artifacts_url;
        const {artifacts} = await readUrl(artifact_url);
        const artifactUrl = artifacts.find(item => item.name === buildType);
        if (typeof artifactUrl === "undefined") {
            log.debug(`No artifact with name ${buildType} found to deploy`);
            return;
        }

        await downloadAndDeploy(artifactUrl["archive_download_url"], buildType);
    } catch (err) {
        console.error(err);
    }
}

async function downloadAndDeploy(archiveUrl, buildType) {
    const downloadedZipFilePath = `${buildType}-build.zip`;
    await downloadFile(archiveUrl, downloadedZipFilePath);
    log.debug(`${buildType} build downloaded successfully`);
    const destDirectory = `./${buildType}/build`;
    const bakZipFile = `./${buildType}/${buildType}.zip.bak`;
    const destZipFile = `./${buildType}/${buildType}.zip`;
    await backupAndExtract(downloadedZipFilePath, destDirectory, bakZipFile, destZipFile);
    log.debug(`${buildType} deployment completed successfully`);
}
exports.main = main;
