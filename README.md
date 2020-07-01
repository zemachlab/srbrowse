# SRBrowse

Repository for the SRBrowse tool

## The tool consists of:
A pipeline to load datasets (FASTQ reads or BAM aligned reads)
A pipeline for loading genomes from FASTA and GFF files (annotation)
An interactive html browser for viewing genomic data at single read resolution
An interface for analyzing single read data

## Software requirements:
* nodejs >8.10
* redis
* bowtie2
* sra-toolkit (for fastq-dump)
