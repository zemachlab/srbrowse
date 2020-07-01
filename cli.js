"use strict";

const main = (config, logger, cliargs) => {
	const res = {json: json => process.stdout.write(JSON.stringify(['response', json]))};
	const io = {emit: (type, data) => process.stdout.write(JSON.stringify([type, data]))};
	const cache = require('./cache')(config);
	const env = {type: "cli", config, logger, res, io, cache};
	try {
		require('./api')[cliargs['f']](env, cliargs);
	} catch (e) {
		console.log(logger(e));
	}
};

const cliargs = process.argv.slice(2).reduce((a,v) => {
	const opt = v.replace(/^[-]+/, '').split(/\=/);
	return Object.assign(a, {[opt[0]]: opt[1] !== "" && !isNaN(opt[1]) ? +(opt[1]) : opt[1]});
}, {});

const required = ["base_dir", "f"];
const missing = required.filter(v=>cliargs[v]===undefined);

if (missing.length > 0) {
	console.log("Required argument(s) "+missing.join(", ")+" not defined");
	process.exitCode = 1;
	process.exit();
}

const config = {base_dir: cliargs['base_dir']};
const logger = require('./logger')({config: config});

require('./maintenance').init({config, logger}).then(() => {
	main(config, logger, cliargs);
}).catch(e => {
	process.exitCode = 1;
});
