"use strict";

const options = process.argv.slice(2).reduce((a,v) => {
	const opt = v.replace(/^[-]+/, '').split(/\=/);
	return Object.assign(a, {[opt[0]]: opt[1]});
}, {});

const express = require('express');
const path = require('path');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const config = {base_dir: options['base_dir'], port: options['port']};
const logger = require('./logger')({config: config});
const cache = require('./cache')(config);

app.use(require('body-parser').urlencoded({extended: true}));

const numericize = v => Array.isArray(v) ? v.map(numericize) : typeof v === "object" ? Object.keys(v).reduce((a,_v)=>Object.assign(a, {[_v]: numericize(v[_v])}), {}) : (v !== "" && v !== null && !isNaN(v) ? +(v) : v);

app.get('/api', function (req, res) {
	const args = numericize(req.query);
	if (args['f'] === undefined)
		return;
	const env = {type: "server", config, logger, res, io, cache};
	require('./api')[args['f']](env, args);
});

app.get('/', function (req, res, next) {
	res.sendFile(path.join(__dirname, '/html/browser.html'));
});

app.get('/datasets', function (req, res, next) {
	res.sendFile(path.join(__dirname, '/html/datasets.html'));
});

app.get('/analyses', function (req, res, next) {
	res.sendFile(path.join(__dirname, '/html/analyses.html'));
});

app.use('/css', express.static('css'));
app.use('/js', express.static('js'));
app.use('/analyses', express.static(config.base_dir+"/analyses", {setHeaders: (res, path, stat) => {
	res.set('Content-Disposition', 'attachment')
}}));

const init = async (env) => {
	const redis = require('redis').createClient();
	redis.on("message", (channel, data) => {
		io.emit("process", JSON.parse(data));
	});
	redis.subscribe("processes", 0, -1, (err, res) => {
		if (err)
			return env.logger(err);
	});
};

require('./maintenance').init({config, logger}).then(() => {
	init({config, logger});
	server.listen(config['port']);
}).catch(e => {
	process.exitCode = 1;
});
