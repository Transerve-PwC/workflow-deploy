const http = require("http");
const { main } = require("./frontend");
const host = 'localhost';
const port = process.env.PORT || 3300;

const requestListener = function (req, res) {
    res.setHeader("Content-Type", "application/json");
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
        console.log(`Deployment started for ${owner}/${buildType} build type ${buildType}`);
        main(owner, repo, buildType).then(_ => {
            console.log(`Deployment successful for ${owner}/${buildType} build type ${buildType}`);
        });
        res.writeHead(200);
        res.end(JSON.stringify({"message" : `Deployment started for ${owner}/${buildType} build type ${buildType}`}));
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({error:"Resource not found"}));
    }
};

const server = http.createServer(requestListener);
server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
