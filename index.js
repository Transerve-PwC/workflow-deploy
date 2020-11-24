const http = require("http");
const { main } = require("./frontend");
const host = 'localhost';
const port = process.env.PORT || 3300;

const requestListener = function (req, res) {
    res.setHeader("Content-Type", "application/json");
    if (req.url == "/github/deploy/frontend") {
        res.writeHead(200);
        res.end(JSON.stringify({"message" : "Front end deployment started successfully"}));
        main("Transerve-PwC","frontend").then(_ => {
            console.log("Front end deployment successful")
        });
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({error:"Resource not found"}));
    }
};

const server = http.createServer(requestListener);
server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
