const http = require("http");
const crypto = require('crypto');
const { main } = require("./frontend");
const host = 'localhost';
const port = process.env.PORT || 3300;
const { deploy } = require("./backend");

const webHookConfigs = [
    {
        "repository_name" : "Transerve-PwC/municipal-services",
        "branch_name" : "refs/heads/feature/estate-services",
        "module_name" : "municipal-services-es",
        "service_name" : "estate-services",
        "git_pull_required" : true,
        "build_required" : true,
    },
    {
        "repository_name" : "Transerve-PwC/municipal-services",
        "branch_name" : "refs/heads/feature/rp",
        "module_name" : "municipal-services-rp",
        "service_name" : "rented-properties",
        "git_pull_required" : true,
        "build_required" : true,
    },
    {
        "repository_name" : "Transerve-PwC/mdms-data",
        "branch_name" : "refs/heads/feature/est-services",
        "module_name" : "core-services",
        "service_name" : "egov-mdms-service",
        "git_pull_required" : false,
        "build_required" : false,
    },
    {
        "repository_name" : "Transerve-PwC/mdms-data",
        "branch_name" : "refs/heads/feature/od-deploy",
        "module_name" : "core-services",
        "service_name" : "egov-mdms-service",
        "git_pull_required" : false,
        "build_required" : false,
    }
]

const WEBHOOK_SIGNATURE = "some-secret-1234";
const requestListener = function (req, res) {
    res.setHeader("Content-Type", "application/json");
    if (req.method == "POST") {
        collectBody(req).then(_ => {
            if (req.url.startsWith("/github/webhook/java")) {
                if (!checkHeaderMatch(req, WEBHOOK_SIGNATURE)) {
                    res.end(JSON.stringify({"message" : "Error in matching github signature"}));
                    return;
                } 
                const payload = req.body;
                if (payload.repository && payload.repository.full_name) {
                    const config = webHookConfigs.find(config => config.repository_name === payload.repository.full_name && config.branch_name === payload.ref);
                    if (!!config) {
                        const moduleName = config.module_name;
                        const serviceName = config.service_name;
                        deploy(moduleName, serviceName, config.git_pull_required, config.build_required).then(_ => {
                            console.log(`Deployment completed for ${moduleName}/${serviceName}`);
                        });
                        res.end(JSON.stringify({"message": `Deployment started for ${moduleName}/${serviceName}`}));
                    } else {
                        res.end(JSON.stringify({"message": `Unknown ref in ${payload.repository.full_name}: ${payload.ref}`}));
                    }
                } else {
                    console.log("Unknown webhook event for ", payload.repository);
                    res.end(JSON.stringify({"message": `Unknown webhook event`}));
                }
            } else {
                res.end(JSON.stringify({"message": `Unable to find deployment for ${req.url}`}));
            }
        });
        return;
    }
    if (req.url.startsWith("/github/deploy")) {
        const components = req.url.split("/");
        if (components.length < 6) {
            res.writeHead(400);
            res.end(JSON.stringify({error:"Error with url need to specify the build type to deploy. Example /github/deploy/Transerve-PwC/frontend/citizen"}));
            return;
        }
        const owner = components[3];
        const repo = components[4];
        const buildType = components[5];
        console.log(`Deployment started for ${owner}/${repo} build type ${buildType}`);
        main(owner, repo, buildType).then(_ => {
            console.log(`Deployment successful for ${owner}/${repo} build type ${buildType}`);
        });
        res.writeHead(200);
        res.end(JSON.stringify({"message" : `Deployment started for ${owner}/${repo} build type ${buildType}`}));
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({error:"Resource not found"}));
    }
};

const FORM_URLENCODED = 'application/x-www-form-urlencoded';
const JSON_ENCODED = 'application/json';

const collectBody = (request) => {
    if(request.headers['content-type'] === JSON_ENCODED) {
        return new Promise((resolve, reject) => {
            let body = '';
            request.on('data', chunk => {
                body += chunk.toString();
            });
            request.on('end', () => {
                try {
                    request.body = JSON.parse(body);
                } catch (err) {
                    console.log("Could not parse request body as JSON", body);
                }
                resolve();
            });
        });
    }
    else {
        return Promise.resolve();
    }
}

const GITHUB_SIG_HEADER_NAME = "x-hub-signature";
const checkHeaderMatch = function(request, secret) {
    const sig = request.headers[GITHUB_SIG_HEADER_NAME] || '';
    if (!sig) {
        console.log(`No header ${GITHUB_SIG_HEADER_NAME} present on request. May not be from github`);
        return false;
    }
    const hmac = crypto.createHmac('sha1', secret);
    const payload = JSON.stringify(request.body);
    if (!payload) {
        console.log("No payload present on request. Cannot validate with header "+GITHUB_SIG_HEADER_NAME);
        return false;
    }
    const digest = Buffer.from('sha1=' + hmac.update(payload).digest('hex'), 'utf8')
    const checksum = Buffer.from(sig, 'utf8')
    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
        console.log(`Request body digest (${digest}) did not match ${GITHUB_SIG_HEADER_NAME} (${checksum})`);
        return false;
    }
    return true;
}

const server = http.createServer(requestListener);
server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
