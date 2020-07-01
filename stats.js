"use strict";

// TODO: replace with function
class ProcessStats {
	constructor(env, type, id, data, meta, rate=2000) {
		this.env = env;
		this.type = type;
		this.id = id;
		this.data = data;
		this.meta = meta;
		this.start = new Date().getTime();
		this.rate = rate;
		this.stage = "processing";
		this.lastUpdate = 0;
		this.milestone("init");
	}
	logger(message) {
		this.env.logger(message);
	}
	update(type, n=1) {
		if (this.data[type] !== undefined)
			this.data[type] += n;
		if (new Date().getTime() - this.lastUpdate > this.rate) {
			this.lastUpdate = new Date().getTime();
			const redis = require('redis').createClient();
			redis.publish("processes", JSON.stringify({id: this.id, type: this.type, stage: this.stage, stats: this.data, meta: this.meta, start: this.start}));
			saveState(this.env, this.type, this.id, this.data, redis);
		}
	}
	milestone(status) {
		this.stage = status;
		const redis = require('redis').createClient();
		redis.publish("processes", JSON.stringify({id: this.id, type: this.type, stage: this.stage, stats: this.data, meta: this.meta, start: this.start}));
		saveState(this.env, this.type, this.id, Object.assign(this.data, {status}), redis);
	}
	end(status="complete") {
		this.milestone(status);
	}
}

const saveState = (env, type, id, data, redis = require('redis').createClient()) => {
	const timestamp = new Date().getTime();
	const key = type+":"+id;
	redis.hmset(key, Object.assign({lastUpdate: timestamp}, data), (err, res) => {
		redis.quit();
		if (err)
			env.logger("Could not update track state: "+err);
	});
};

const stats = (env, type, id, data, meta) => {
	return new ProcessStats(env, type, id, data, meta);
};

module.exports = stats;