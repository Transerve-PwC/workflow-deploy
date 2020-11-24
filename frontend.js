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

function deleteFolderRecursive(path) {
    if (fs.existsSync(path)) {
      fs.readdirSync(path).forEach((file, index) => {
        const curPath = Path.join(path, file);
        if (fs.lstatSync(curPath).isDirectory()) { // recurse
          deleteFolderRecursive(curPath);
        } else { // delete file
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(path);
    }
  };

async function unzip(generatedZipFile, destDirectory, bakFile, zipFilePath) {

    return new Promise((resolve, reject) => { 
        fs.unlinkSync(bakFile)

        fs.rename(zipFilePath, bakFile, function (err) {
            if (err) throw err
            console.log('Successfully renamed - AKA moved!')
          })

        deleteFolderRecursive(destDirectory);

        

        const ls = spawn('unzip', [generatedZipFile, "-d", destDirectory]);
        
        ls.stdout.on('data', (data) => {
          console.log(`stdout: ${data}`);
        });
        
        ls.stderr.on('data', (data) => {
          console.error(`stderr: ${data}`);
        });
        
        ls.on('close', (code) => {
          console.log(`child process exited with code ${code}`);
          resolve();
        });
    })

}

const workFlowRunURL = "https://api.github.com/repos/Transerve-PwC/frontend/actions/runs"


async function main() {
    try{
        const {workflow_runs} = await readUrl(workFlowRunURL);
        const artifact_url = workflow_runs[0].artifacts_url;
        const {artifacts} = await readUrl(artifact_url);
        const citizen_build_url = artifacts.find(item => item.name.includes("citizen"))["archive_download_url"];
        const employee_build_url = artifacts.find(item => item.name.includes("employee"))["archive_download_url"];
        //TODO: Customize file name.
        const zipFilePath = "./build.zip";

        //Citizen build file

        await downloadFile(citizen_build_url, zipFilePath);
        console.log("File downloaded successfully");
        await unzip(zipFilePath, "./citizen/build", "./citizen/build.zip.bak", "./citizen/build.zip")
        fs.rename(zipFilePath, "./citizen/build.zip", function (err) {
            if (err) throw err
            console.log('Successfully renamed - Citizen!')
          })

        //employee build file

        await downloadFile(employee_build_url, zipFilePath);
        console.log("File downloaded successfully");
        await unzip(zipFilePath, "./employee/build", "./employee/build.zip.bak", "./employee/build.zip")
        fs.rename(zipFilePath, "./employee/build.zip", function (err) {
            if (err) throw err
            console.log('Successfully renamed - Employee!')
          })
    } catch (err) {
        console.error(err);
    }
}

exports.main = main;
