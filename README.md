# SRBrowse

Repository for the SRBrowse tool

## The tool consists of:
A pipeline to load datasets (FASTQ reads)
A pipeline for loading genomes from FASTA (assemblies) and GFF files (annotations)
An interactive html browser for viewing genomic data at single read resolution
An interface for analyzing single read data

## Software requirements:
* nodejs >8.10
* redis
* bowtie2
* sra-toolkit (for fastq-dump)

## Installation:
* Install node.js: https://nodejs.org/en/download/
* Install redis: https://redis.io/topics/quickstart
* Install bowtie2: http://bowtie-bio.sourceforge.net/bowtie2/manual.shtml#obtaining-bowtie-2
* Install sra-toolkit: https://ncbi.github.io/sra-tools/install_config.html
* Recommended: install PM2 using `npm install pm2 -g` (to run the tool as a service)
* Download or clone this repository into a directory (e.g. /home/myuser/mydir)
* Run `npm update` in the chosen directory

## Initiate backend:
The tool can be run either as a service using PM2 (more stable) or as a node process:
* As a process: `node server.js --base_dir=/home/myuser/mydir --port=3000`
* With PM2: `pm2 start server.js --name "srbrowse" -- --base_dir=/home/myuser/mydir --port=3000`

The above assumes that the directory with the code also contains the data directories (saved tracks, assemblies, etc.). The `base_dir` parameter can be set to any directory that is writable by the node process. In addition, you can use a different port if you already have a service running on this port.

## Accessing the tool:
Once installed and initiated, the tool can be accessed by opening http://localhost:3000/ in a browser. For detailed information on using the interface, please see manual.pdf in this repository.
