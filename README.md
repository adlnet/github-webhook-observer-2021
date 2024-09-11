# 2021 Webhook Observer

This project creates a small NodeJS service to listen for Github webhooks and rebuild project containers when their codebases change.  

As this service will be listening for GitHub webhooks, some minor configuration is required and the webhooks themselves should be set to send PUSH notifications only.

## TL;DR

- `git clone https://github.com/adlnet/github-webhook-observer-2021 webhooks`
- `cd webhooks`
- `sudo ./install.sh`
- `cp sample.env .env`
- Populate `.env` file (see below)
- `sudo pm2 start watch.js`

## Installation

For installation, we deploy this with PM2 and recommend that approach, but it technically only requires NodeJS and NPM.  An install script `install.sh` is included and will handle the NodeJS + NPM versioning on Linux:
```
git clone https://github.com/adlnet/github-webhook-observer-2021 webhooks
cd webhooks
sudo ./install.sh
cp sample.env .env
```

## Config

The observer needs a little configuration to work properly.  These settings are handled through a typical `.env` file, with a `sample.env` included as a starting point.

|Property|Example|Description|
|-|-|-|
|PULLING_USER|`ubuntu`|Machine user running the git commands.|
|REPO|`../my-project`|Relative path to the repo being observed.|
|WEBHOOK_SECRET|`some-long-secret`|The webhook secret being used in the GitHub Webhook settings|
|PORT|`8000`|The port being used by the observer|
|REBUILD_COMMAND|`docker-compose up -d`|Seldom-used command that will be triggered if all containers need to be rebuilt.|

but the project does support CLI arguments if that's more your style:
```
node watch.js [path/to/project/folder] [github-webhook-secret] [port] [rebuild.sh]

arguments:

[path/to/project/folder] - Required. This is from the point of the .js file, 
        so if the observer and target folders are in the same directory then it would
        look like. "../targert-project-folder".

[github-webhook-secret] - Required. This is the secret set in the github webhook settings.

[port] - Optional. The default is 8000.

[rebuild.sh] - Optional. name of Bash script to rebuild project. Expected in project root directory. 
               The default is 'rebuild.sh'
               
[user] - Optional. The default is 'ubuntu'.
```


## Running

To start the observer, we'll create a PM2 process and have that handle everything.
```
sudo pm2 start watch.js
```

This will ensure that the observer persists through machine restarts and whatnot.  More information on PM2 can be found **[here](https://pm2.keymetrics.io/docs/usage/quick-start/)**.
