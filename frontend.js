const https = require("https");
const fs = require("fs");
const Path = require('path');
const zlib = require("zlib");
const { spawn } = require('child_process');

const OAUTH_TOKEN = process.env.OAUTH_TOKEN;
const log = {
    _log : function (type, str, ...params) {
        console.log(type, str, ...params);
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
            console.log("Removed .bak file successfully", bakFile);
        } catch (err) {
            console.log("Could not delete .bak file", bakFile);
        }

        //Rename existing zip file as .bak
        try {
            fs.renameSync(zipFilePath, bakFile);
            console.log("Moved .zip file to .bak successfully", zipFilePath, bakFile);
        } catch (e) {
            console.log("Could not move .zip file to .bak", zipFilePath, bakFile);
        }

        //Recursively delete build folder
        try {
            deleteFolderRecursiveSync(destDirectory);
            console.log("Recursively deleted build folder", destDirectory);
        } catch (e) {
            console.log("Could not delete build folder", destDirectory);
        }

        //unzip downloaded file as build folder.
        const ls = spawn('unzip', ["-q", generatedZipFile, "-d", destDirectory]);
        
        ls.stdout.on('data', (data) => {
          console.log(`stdout: ${data}`);
        });
        
        ls.stderr.on('data', (data) => {
          console.error(`stderr: ${data}`);
          reject(new Error("Could not unzip ", generatedZipFile));
        });
        
        ls.on('close', (code) => {
          console.log("Downloaded zip file expanded", generatedZipFile);
          resolve();
        });
    }).then(_ => {
        try {
            fs.renameSync(generatedZipFile, zipFilePath);
            console.log("Moved build.zip to final zip file path", generatedZipFile, zipFilePath);
        } catch (e) {
            console.log("Could not move build.zip to final zip file path", generatedZipFile, zipFilePath);
        }
    })
}



async function main(owner = "Transerve-PwC", repo = "frontend") {
    try{
        const workFlowRunURL = `https://api.github.com/repos/${owner}/${repo}/actions/runs`
        const {workflow_runs} = await readUrl(workFlowRunURL);
        const artifact_url = workflow_runs[0].artifacts_url;
        const {artifacts} = await readUrl(artifact_url);
        const citizen_build_url = artifacts.find(item => item.name.includes("citizen"))["archive_download_url"];
        const employee_build_url = artifacts.find(item => item.name.includes("employee"))["archive_download_url"];
        const downloadedZipFilePath = "./build.zip";

        await downloadFile(citizen_build_url, downloadedZipFilePath);
        console.log("Citizen build downloaded successfully");
        let destDirectory = "./citizen/build";
        let bakZipFile = "./citizen/citizen.zip.bak";
        let destZipFile ="./citizen/citizen.zip"
        await backupAndExtract(downloadedZipFilePath, destDirectory, bakZipFile, destZipFile);
        console.log("Citizen deployment completed successfully");
        
        await downloadFile(employee_build_url, downloadedZipFilePath);
        console.log("Employee build downloaded successfully");
        destDirectory = "./employee/build";
        bakZipFile = "./employee/employee.zip.bak";
        destZipFile ="./employee/employee.zip"
        await backupAndExtract(downloadedZipFilePath, destDirectory, bakZipFile, destZipFile);
        console.log("Employee deployment completed successfully");

    } catch (err) {
        console.error(err);
    }
}

exports.main = main;
