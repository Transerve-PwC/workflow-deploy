const { spawn } = require("child_process");
const { resolve } = require("path");

const log = {
    _log : function (type, str, ...params) {
        console.log(type, new Date().toISOString(), str, ...params);
    },
    debug : function(str, ...params) {
        this._log("DEBUG", str, ...params);
    },
    warn : function(str, ...params) {
        this._log("WARN", str, ...params);
    },
    error: function(str, ...params) {
        this._log("ERROR", str, ...params);
    }
}

const spawnPromise = function(cmd, vargs = [], options = {}) {
    return new Promise((resolve, reject) => {
        const ls = spawn(cmd, vargs, options);
        
        ls.stdout.on('data', (data) => {
          log.debug(`stdout: ${data}`);
        });
        
        ls.stderr.on('data', (data) => {
          log.debug(`stderr: ${data}`);
        //   reject(new Error("Could not execute command ", cmd, vargs));
        });
        
        ls.on('close', (code) => {
          log.debug(`Command ${cmd} ${vargs} exited with code ${code}`);
          resolve(code);
        });
    })
}

const spawnPromiseWithCode = async function(cmd, vargs = [], options = {}) {
    try {
        const exitCode = await spawnPromise(cmd, vargs, options);
        if (exitCode == 0) {
            resolve();
        } else {
            reject( new Error(`Command ${cmd} exited with code ${code}`));
        }
    } catch (error) {
        throw error;
    }
} 

const REPOSITORIES_ROOT = process.env.REPOSITORIES_ROOT || "/home/ubuntu/dev/github";
const BUILD_RUN_DIR =  process.env.BUILD_RUN_DIR || `${REPOSITORIES_ROOT}/build/run`;

async function main(repoName, serviceName, gitPullRequired = true, buildRequired = true) {

    /**
     * git pull from Transerve-PwC/municipal-services
     */
    if (gitPullRequired) {
        await spawnPromiseWithCode("git", ["pull"], { cwd: `${REPOSITORIES_ROOT}/${repoName}`});
    } else {
        log.debug(`Skipping git pull for ${repoName} - ${serviceName}`);
    }
    
    /**
     * Shut down the running service
     */
    try {
        await spawnPromiseWithCode("sh", ["../src/shutdown.sh", serviceName], {cwd: BUILD_RUN_DIR});
    } catch (error) {
        log.error(error);
    }

    /**
     * Build the service from code
     */
    if (buildRequired) {
        await spawnPromiseWithCode("sh", ["../src/build.sh", `../../${repoName}`,serviceName], {cwd: BUILD_RUN_DIR});
    } else {
        log.debug(`Skipping build for ${repoName} - ${serviceName}`);
    }

    /**
     * Start the service
     */
    await spawnPromiseWithCode("sh", ["../src/startup.sh", `../artifacts/${serviceName}/target/*.jar`,serviceName], {cwd: BUILD_RUN_DIR});
}
/**
    echo "egov-mdms-service core-services"
    sh ../src/shutdown.sh egov-mdms-service

    # egov-mdms-service
    sh ../src/startup.sh ../artifacts/egov-mdms-service/target/egov-mdms-service-test-0.0.1-SNAPSHOT.jar egov-mdms-service 128m
 */
// main("municipal-services-es", "estate-services");

exports.deploy = main;
