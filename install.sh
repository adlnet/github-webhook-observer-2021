#!/bin/bash

## Update the NodeJS version for APT
curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -

## Install our dependencies
apt-get install -y nodejs
npm install -g pm2
npm install
