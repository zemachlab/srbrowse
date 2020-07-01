"use strict";

const checkFASTQ = (filename) => {
	return new Promise((resolve, reject) => {
		const n = 4; // Lines per entry
		const samplen = 100; // Sample entries for read length
		const exec = require("child_process").exec;
		if (filename.match(/\.gz$/i)) {
			exec("gzip -l "+filename, (err, output) => {
				if (err)
					return reject(new Error("File not found"));
				const uncomp = +(output.toString().split(/\n/)[1].split(/[\s]+/)[2]);
				exec("zcat "+filename+" | head -n "+(n*samplen)+" -", (err, output) => {
					if (err)
						return reject(new Error("Error reading from file"));
					const sampled_bytes = output.toString();
					const readlength = sampled_bytes.split(/\n/).reduce((a,v,i)=>(i-1)%n===0?a+v.length:a, 0) / samplen;
					resolve({reads: Math.round(uncomp / (sampled_bytes.length / samplen)), readlength: readlength});
				});
			});
		} else {
			require('fs').stat(filename, (err, stat) => {
				if (err)
					return reject(new Error("File not found"));
				const uncomp = stat.size;
				exec("head -n "+(n*samplen)+" "+filename, (err, output) => {
					if (err)
						return reject(new Error("Error reading from file"));
					const sampled_bytes = output.toString();
					const readlength = sampled_bytes.split(/\n/).reduce((a,v,i)=>(i-1)%n===0?a+v.length:a, 0) / samplen;
					resolve({reads: Math.round(uncomp / (sampled_bytes.length / samplen)), readlength: readlength});
				});
			});
		}
	});
};

module.exports = { checkFASTQ: checkFASTQ }
