"use strict";

class Cache {
	constructor(config) {
		this.config = config;
		this.data = {};
	}
	retrieve(type, id) {
		if (this.data[id] !== undefined) {
			this.data[id]['last_retrieved'] = new Date().getTime();
			return Promise.resolve(this.data[id]['data']);
		}
		return new Promise((resolve, reject) => {
			require('fs').readFile(this.config.base_dir+(type === "annotation" ? '/annotations/'+id+'.json.idx' : '/tracks/'+id+'.reads.idx'), (err, res) => {
				if (err)
					return reject(err);
				const idx = JSON.parse(res.toString());
				const pos = Object.keys(idx['idx']);
				let cv = 0;
				const index = new Uint32Array(pos[pos.length-1]).map((v,i)=>{cv = idx['idx'][i] !== undefined ? idx['idx'][i] : cv;return cv});
				this.data[id] = {data: {density: idx['density'], idx: index}, last_retrieved: new Date().getTime()};
				resolve(this.data[id]['data']);
			});
		});
	}
	cleanup(ttl=30) {
		for (const id in this.data) {
			if (new Date().getTime() - this.data[id]['last_retrieved'] > ttl * 60 * 1000)
				delete this.data[id];
		}
	}
}

const init = (config) => {
	return new Cache(config);
};

module.exports = init;