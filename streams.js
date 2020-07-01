"use strict";

const { Transform, Writable } = require('stream');

class ReadString extends Writable {
	constructor(f, l=1) {
		super();
		this.f = f;
		this.l = l;
		this.cache = "";
		this.linecache = [];
	}
	_write(chunk, encoding, cb) {
		const lines = (this.cache + chunk.toString()).split(/\r?\n/);
		if (lines.length === 1) { // To prevent memory leak with very long lines (>chunk size)
			this.cache = "";
			this.f.reduce((v, f)=>!v?false:f(v), lines[0]);
			return cb(null);
		}
		this.cache = lines.pop();
		for (const line of lines) {
			if (line === null)
				continue;
			const input = this.l > 1 ? ((lc, line, l) => {
				lc.push(line);
				if (lc.length === l) {
					const lines = lc.slice(0);
					lc.length = 0;
					return lines;
				}
				return null;
			})(this.linecache, line, this.l) : line;
			if (input)
				this.f.reduce((v, f)=>!v?false:f(v), input);
		}
		cb(null);
	}
}

class TransformString extends Transform {
	constructor(f, output="string", l=1) {
		super ({readableObjectMode: true});
		this.f = f;
		this.l = l;
		this.output = output;
		this.cache = "";
		this.linecache = [];
	}
	_transform(chunk, encoding, cb) {
		const lines = (this.cache + chunk.toString()).split(/\r?\n/);
		if (lines.length === 1 && this.l === 1) { // To prevent memory leak with very long lines (>chunk size)
			this.cache = "";
			const outline = this.f.reduce((v, f)=>!v?false:f(v), lines[0]);
			return cb(null, outline ? outline : undefined);
		}
		this.cache = lines.pop();
		const outlines = [];
		for (const line of lines) { // TODO: compress into single function
			if (line === null)
				continue;
			const input = this.l > 1 ? ((lc, line, l) => {
				lc.push(line);
				if (lc.length === l) {
					const lines = lc.slice(0);
					lc.length = 0;
					return lines;
				}
				return false;
			})(this.linecache, line, this.l) : line;
			const outline = input ? this.f.reduce((v, f)=>!v?false:f(v), input) : input;
			if (outline)
				outlines.push(this.output === "string" && Array.isArray(outline) ? outline.join("\n") : outline);
		}
		cb(null, outlines.length > 0 ? this.output === "flat" ? outlines.join("") : outlines.join("\n")+"\n" : undefined);
	}
}

const ts = (f, output, l) => new TransformString(f, output, l);
const rs = (f, output, l) => new ReadString(f, output, l);

module.exports = {ts, rs};