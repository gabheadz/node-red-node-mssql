module.exports = function(RED) {
    "use strict";
    var sql = require('mssql');
    var tedious = require('tedious');

    function MSSQLNode(config) {
        RED.nodes.createNode(this,config);
        this.server = config.server;
        this.port = config.port;
        this.dbname = config.database;
        
        this.connected = false;

        var node = this;

        function doConfigurePool() {    
            node.emit("state","connecting");
            node.connPool = new sql.Connection({
                user: node.credentials.user,
                password: node.credentials.password,
                server: node.server,
                database: node.dbname,
                pool: {
                    max: 10,
                    min: 0,
                    idleTimeoutMillis: 30000
                }
            });

            node.connPool.on('error', function(err) {
                
                if (err.code === 'EALREADYCONNECTED') {
                    //ignore... already connected
                    return;
                }

                if (err.code === 'EALREADYCONNECTING') {
                    //node.emit("state","connecting");
                    return;
                }

                node.connected = false;
                node.emit("state",err.code);
                
                if (err.code === 'ETIMEOUT') {
                    doConfigurePool(); 
                } 
                else {
                    node.error(err);
                }
            });

            node.connPool.on('connect', function() {
                node.connected = true;
                node.emit("state","connected");
            });

            node.connPool.on('close', function() {
                //connection closed
                node.connected = false;
            });

            node.connPool.connect(function(err) {
                if (err) {
                    node.connected = false;
                    node.emit("state",err.code);
                }
            });
        }

        this.configurePool = function() {
            if (!this.connected) {
                node.emit("state","connecting"); 
                doConfigurePool(); 
            }
            if (this.connected) { 
                node.emit("state","connected"); 
            }
        }

        this.on('close', function (done) {
            if (this.tick) { clearTimeout(this.tick); }
            node.connected = false;
            node.emit("state"," ");
            if (this.connection) {
                node.conObject.close();
                done();
            } else {
                done();
            }
        });

    }
    RED.nodes.registerType("MSSQLdatabase",MSSQLNode, {
        credentials: {
            user: {type: "text"},
            password: {type: "password"}
        }
    });

    function MssqlDBNodeIn(n) {
        RED.nodes.createNode(this,n);
        this.mydb = n.mydb;
        this.mydbConfig = RED.nodes.getNode(this.mydb);

        if (this.mydbConfig) {

            this.mydbConfig.configurePool();
            var node = this;

            node.mydbConfig.on("state", function(info) {
                if (info === "connecting") { node.status({fill:"grey",shape:"ring",text:info}); }
                else if (info === "connected") { node.status({fill:"green",shape:"dot",text:info}); }
                else {
                    if (info === "ELOGIN ") { info = "Login Failed"; }
                    if (info === "EINSTLOOKUP ") { info = "Instance lookup failed"; }
                    if (info === "ESOCKET  ") { info = "Socket error"; }
                    node.status({fill:"red",shape:"ring",text:info});
                }
            });

            node.on("input", function(msg) {
                if (typeof msg.topic === 'string') {
                    if (msg.topic) {
                        new sql.Request(node.mydbConfig.connPool)
                            .query(msg.topic).then(function(recordset) {
                                //console.log(recordset);
                                msg.payload = recordset;
                                node.send(msg);
                                node.status({fill:"green",shape:"dot",text:"OK"});
                            }).catch(function(err) {
                                node.error(err,msg);
                                node.status({fill:"red",shape:"ring",text:"Error"});
                            });
                    } else {
                        node.error("msg.topic : query is not defined");
                    }
                }
                else {
                    if (typeof msg.topic !== 'string') { node.error("msg.topic : the query is not defined as a string"); }
                }

            });

            node.on('close', function () {
                node.mydbConfig.removeAllListeners();
                node.status({});
            });
        }
        else {
            this.error("MS SQL database not configured");
        }
    }
    RED.nodes.registerType("mssql",MssqlDBNodeIn);
}