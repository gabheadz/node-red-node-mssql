module.exports = function(RED) {
    "use strict";
    var reconnect = RED.settings.mysqlReconnectTime || 20000;
    var sql = require('mssql');

    function MSSQLNode(config) {
        RED.nodes.createNode(this,config);
        this.server = config.server;
        this.port = config.port;

        this.connected = false;
        this.connecting = false;

        this.dbname = config.database;
        this.setMaxListeners(0);
        var node = this;

        function doConnect() {
            node.connecting = true;
            node.emit("state","connecting");
            
            var config = {
                server: node.server,
                userName: node.credentials.user,
                password: node.credentials.password,
                database: node.dbname,
                pool: {
                    max: 10,
                    min: 0,
                    idleTimeoutMillis: 30000
                }
            };
            
            node.connection = sql.connect(config);
            //node.emit("state","connected");
            node.connecting = false;
            node.connected = true;

            /*
            node.connection.then(function(err) {
                node.connecting = false;
                if (err) {
                    node.error(err);
                    node.emit("state",err.code);
                    node.tick = setTimeout(doConnect, reconnect);
                } else {
                    node.connected = true;
                    node.emit("state","connected");
                }
            }).catch(function (err) {
                
            })

            node.connection.on('error', function(err) {
                node.connected = false;
                node.emit("state",err.code);
                if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                    doConnect(); // silently reconnect...
                } else {
                    node.error(err);
                    doConnect();
                }
            });
            */
        }

        this.connect = function() {
            if (!this.connected && !this.connecting) { doConnect(); }
            if (this.connected) { node.emit("state","connected"); }
            else { node.emit("state","connecting"); }
        }

        this.on('close', function (done) {
            if (this.tick) { clearTimeout(this.tick); }
            node.connected = false;
            node.emit("state"," ");
            if (this.connection) {
                node.connection.end(function(err) {
                    if (err) { node.error(err); }
                    done();
                });
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
            this.mydbConfig.connect();
            var node = this;
            node.mydbConfig.on("state", function(info) {
                if (info === "connecting") { node.status({fill:"grey",shape:"ring",text:info}); }
                else if (info === "connected") { node.status({fill:"green",shape:"dot",text:info}); }
                else {
                    if (info === "ECONNREFUSED") { info = "connection refused"; }
                    if (info === "PROTOCOL_CONNECTION_LOST") { info = "connection lost"; }
                    node.status({fill:"red",shape:"ring",text:info});
                }
            });

            node.on("input", function(msg) {
                if (node.mydbConfig.connected) {
                    if (typeof msg.topic === 'string') {
                        //console.log("query:",msg.topic);
                        var bind = Array.isArray(msg.payload) ? msg.payload : [];
                        node.mydbConfig.connection.query(msg.topic, bind, function(err, rows) {
                            if (err) {
                                node.error(err,msg);
                                node.status({fill:"red",shape:"ring",text:"Error"});
                            }
                            else {
                                msg.payload = rows;
                                node.send(msg);
                                node.status({fill:"green",shape:"dot",text:"OK"});
                            }
                        });
                    }
                    else {
                        if (typeof msg.topic !== 'string') { node.error("msg.topic : the query is not defined as a string"); }
                    }
                }
                else {
                    node.error("Database not connected",msg);
                    node.status({fill:"red",shape:"ring",text:"not yet connected"});
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