"use strict";

var chai = require("chai"),
    when = require("when"),
    rewire = require("rewire"),
    node = require("when/node"),
    getport = require("getport"),
    chaiAsPromised = require("chai-as-promised"),
    net = require("net"),
    Writable = require("stream").Writable,
    expect = chai.expect,
    create = rewire("../lib/create.js"),
    phridge = require("../lib/main.js"),
    Phantom = require("../lib/Phantom.js"),
    slow = require("./helpers/slow.js"),
    request = require("../lib/request.js");

chai.config.includeStack = true;
chai.use(chaiAsPromised);

getport = node.lift(getport);

describe("create(config?)", function () {

    after(slow(function () {
        return phridge.exitAll();
    }));

    it("should resolve to an instance of Phantom", slow(function () {
        return expect(create()).to.eventually.be.an.instanceOf(Phantom);
    }));

    it("should pass the provided config to phantomjs", slow(function () {
        var stdout = new Writable(),
            message = "";

        stdout._write = function (chunk, encoding, callback) {
            message += chunk.toString();
            setImmediate(callback);
        };

        return getport(10000)
            .then(function (port) {
                var server = net.createServer();

                // We're blocking the GhostDriver port so phantomjs crashes on startup.
                // Otherwise the phantomjs processes can't be killed because it doesn't
                // listen on our commands in GhostDriver-mode.
                // Using our stdout to determine if phantomjs entered the GhostDriver-mode.
                server.listen(port);

                phridge.config.stdout = stdout;
                phridge.create({
                    webdriver: "localhost:" + port
                });
                phridge.config.stdout = process.stdout;

                return when.promise(function (resolve, reject) {
                    setTimeout(function () {
                        if (message.search("GhostDriver") === -1) {
                            reject(new Error("GhostDriver config not recognized"));
                        } else {
                            resolve();
                        }
                    }, 2000);
                });
            });
    }));

    it("should share a secret with the phantomjs process so no untrusted code can be executed", slow(function () {
        var evilCode = "resolve('harharhar')";

        return expect(create()
            .then(function (phantom) {
                return request({
                    port: phantom.port,
                    path: "/",
                    body: evilCode
                });
            }))
            .to.eventually.have.property("statusCode", 403);
    }));

});