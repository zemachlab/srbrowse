"use strict";

const logger = (env) => {
	const archive = (logfile, maxlen=1024*1024) => {
		require('fs').stat(logfile, (err, stats) => {
			if (stats['size'] > maxlen) {
				const exec = require("child_process").exec;
				exec("gzip "+logfile, (err, res) => {
					const stamp = new Date().toLocaleString("UTC").replace(/[^0-9]/g, '');
					err === null ? exec("mv "+logfile+".gz "+logfile+"."+stamp+".gz") : 0; // Error handling
				});
			}
		});
	}
	return (message, silent = 1) => {
		if (silent === 0)
			console.log(message);
		if (!env.config.base_dir || env.config.base_dir === "")
			return console.log("Base directory undefined");
		const logfile = env.config.base_dir+"/logs/error.log";
		require('fs').appendFile(logfile, message+"\n", err => {
			if (!err)
				return archive(logfile);
			console.log("Unable to write to logfile");
		});
		return message;
	}
};

module.exports = logger;