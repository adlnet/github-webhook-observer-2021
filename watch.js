/***
*  Github Webhook Observer
* 
*  This is a little server that listens to github webhooks and rebuilds projects when they recieve "push" notification. 
*  Github webhooks send all kinds of notifications, but this only acts on "push". 
*  
***/
const http = require('http');
const crypto = require('crypto');
const process = require('process');
const yaml = require('js-yaml');
const fs = require('fs');
const { execSync } = require('child_process');
const dotenv = require("dotenv");

/***
 * Repo config
 **/
const dotenvConfig = dotenv.config();
const args = process.argv;
const repo = args[2] || process.env.REPO || "../path-to-project-folder";
const secret = args[3] || process.env.WEBHOOK_SECRET || "git-observer-secret";
const port = args[4] || process.env.PORT || 8000;
const rebuildCommand = args[5] || process.env.REBUILD_COMMAND || "bash rebuild.sh"
const user = args[6] || process.env.PULLING_USER || "ubuntu";
const branchPattern = args[7] || process.env.BRANCH_PATTERN || null;
const pullOnly = (process.env.PULL_ONLY === "true") || false;

/**
 * Check whether or not a given string matches a given wildcard pattern.  
 * 
 * Stolen from: https://stackoverflow.com/a/32402438
 * 
 * @param {String} str The string we want to compare. 
 * @param {String} rule The wildcard pattern to check against.
 * @returns 
 */
const wildcardMatch = (str, rule) => {
    // for this solution to work on any string, no matter what characters it has
    var escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");

    // "."  => Find a single character, except newline or line terminator
    // ".*" => Matches any string that contains zero or more characters
    rule = rule.split("*").map(escapeRegex).join(".*");

    // "^"  => Matches any string with the following at the beginning of it
    // "$"  => Matches any string with that in front at the end of it
    rule = "^" + rule + "$"

    //Create a regular expression object for matching string
    var regex = new RegExp(rule);

    //Returns true if it finds a match, otherwise it returns false
    return regex.test(str);
}

/***
 * Use the file system to determine which containers the modified files belong to.
 * Args: 1. Array [] of containerNames from getContainerNames 2. Array [] of strings of modified files from github req body 
 * Return: Array []
 ***/
const whichContainersRebuild = (composeConfig, modifiedFiles) => {
    let rebuildContainers = new Map();

    modifiedFiles.forEach(filePath => {
        for (const [serviceName, serviceConfig] of Object.entries(composeConfig['services'])) {
            if (filePath.includes(serviceName)) {
                //hashing to exclude duplicates.
                rebuildContainers.set(serviceName, serviceName);
            }
        }
    });

    //return list off services to rebuild listed once in an array. 
    return Array.from(rebuildContainers.values(), val => val);
};

const isEqualLength = (x, y) => x.length == y.length;


http.createServer(function (req, res) {

    req.on('data', function (chunk) {

        let sig = "sha1=" + crypto.createHmac('sha1', secret).update(chunk.toString()).digest('hex');

        if (req.headers['x-hub-signature'] == sig) {

            console.log(`
            ========================================
            ==    Seeing a push; going to pull.   ==
            ========================================
            `);

            //Pull new updates
            execSync(`cd ${repo} && sudo -H -u ${user} git pull && docker ps`);

            if (pullOnly)
                return;

            //Github headers list the files(including full path) changed from last commit in array of strings.
            let body = JSON.parse(chunk);

            // Only do this if we're actually monitoring this branch, or if there wasn't a branch
            // specified at all
            let branch = body.ref.substr("refs/heads/".length);
            let ignoreThisBranch = branchPattern != null && !wildcardMatch(branch, branchPattern);
            if (ignoreThisBranch)
                return;

            let filesModifed = body['head_commit']['modified'] || [];
            let composeConfig = {};

            //Get latest version of compose file for service names, etc.
            try {
                composeConfig = yaml.load(fs.readFileSync(`${repo}/docker-compose.yml`, 'utf8'));
            } catch (e) {
                console.log("There is something wrong with the Docker-Compose file");
                console.error(e);
            }

            //Using the list of changed files(with path) and the list of services to determine which to rebuild.
            let containersToRebuild = whichContainersRebuild(composeConfig, filesModifed);

            //rebuild all with rebuild script
            if (isEqualLength(Object.entries(composeConfig['services']), containersToRebuild)) {
                execSync(`cd ${repo} && ${rebuildCommand}`);

                //Rebuild only the new ones and restart nginx 
            } else if (containersToRebuild.length > 0) {
                containersToRebuild.forEach(service => {
                    execSync(`cd ${repo} && docker-compose stop ${service}`);
                    execSync(`cd ${repo} && docker-compose rm ${service}`);
                });
                //Always restart nginx last
                execSync(`cd ${repo} && docker-compose up -d --no-deps --build `);
                execSync(`cd ${repo} && docker-compose restart nginx`);

                console.log(`
            ========================================
            == Just rebuilt service: ${containersToRebuild.toString()}               
            ========================================
            `);

            } else {
                console.log("There was a push, but 0 project folders were changed.\n No containers to rebuild.\n");
            }

            console.log(`
            ========================================
            ==      Finished making updates.      ==
            ========================================
            `);
        }
    });
    res.end();
}).listen(port);


console.log(`

========================================================================
===                Webhook Observer is watching.                     ===
========================================================================

                              .@&%&%&&%#                                   
                          .@&&&(##%#(%%%#%&&%#                              
                     .@@&&%%%((////(###(((#####%%%@.                        
                .&%&%####(//((((((////####(#%#%##%%%&&&(                    
           ,@&&&####(##%%(/(/((((((((((########(((((((((%&&&#               
      ,@&&&%#(((((((((((#######%%((###((((/////*///((//(#%%%#%%&&@          
 .@&&&####(((((%%%#####%(((((((((//((((((////*((((/////((###((#####%%%(     
,&&&&&&&&%###%%%%#(((((((((((((//(((((((/****/((((((((((((##%##%&&&%&&&&    
,&&#%&&&&&&&%%######%%#(((((((((((((/////****(###(((((####%%%%&&&&&&%%&&    
,&&%#%%#%%&&&&&%%&&%%%#(####(((//////***//////(((#%##%&&&&&@&&&&%%%%%&&&    
,&&%%##%%%%%%%%&&&&&&&&&#(###(((((/****///((####%&&&&@&&@&&&%&&%&&&&&&&&    
,&&&&&&&%%##(#####%&@&&&&&&&&%###//(((######%%&&&&&&@&%%%%%%%%%%&&&&@&&&    
,%&&@@&&&&&&&#((###%%###%&&&&&&&%%#(((%&&&&&@&&&%%%%&%%&%%%&&&&&&@@@@&&&    
,%&&&&%&@@@@&&&&&&%##%%####%%&&&&&&%&&&&&@@&%%%%%%%%%%&@&&&&@@@@@&&&&&&&    
,&&**//%&&&%&@&&&&&&&&&#####%%%%%%&&&&&&&&&%%&&&%&&@@@@@@@@@&&&&&&&&&&&&    
,&&**//****/&%&&&&@@@&&&&&&&%###%%&&&&&%%%%%&&&&@@@@@@@@&&&&&&&&&&&&&&&&    
,&&###////(/*///(%&&&&&&&@&&&&&&&%&&&&&&&&&&@@@@@@&&&&&&&&&&&&&&&&&&&&&&    
,&&(((#####(/(((//////%&&&&&&&@&&&&&&&&&@@@@@&&&&&&&&&&&&&&&&&&&&&&&&&&&    
,&&##*/@@@&#####(((((/**//(&&&&&&&&&&&@@&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&    
,&&##//@@@@@(//(///(((((((//**/(%&&%&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&@@&&    
,&&##//**(@@**//((((/#####(((((///%%&&&&&&&&&&&&&&&&&&&&&&&&&&&@@@@@&&&&    
,&&##/////**////((//(((((&##%##(((%%&&&&&&&&&&&&&&&&&&&&&&@@@@@@@&&&&&&&    
,&&##/////////(((((//((((@@@@&(###&&&&&&&&&&&&&&&&&&&&@@@@@&&@@&%%&%%&&&    
,&&#(###(//////(###(/((((@@@@&//((%&&&&&&&&&&&&&@@@@@@@&&@&&%&&%%&&&&&@&    
  *&&&&&#####(////(%#(////***//*##%&&&&&&&&@@@@@@&&&@@%%%%%%%%%%&&&@&@.     
       *&&&&&#####(/////////////##%&&&&@@@@@@&&&&%%%&&%&%%%%&@&@&,          
            /&&&&&#####(((//////##&&&&&&&@@&&%%%%%%%%%&@&&&&.               
                 ,@@@&%#####(//(##&@&&&&&&&%%&&&%&@@&&@.                    
                      *&&&&%####(#&&&&&%%%%%%&&@&@.                         
                               /&@&@%#&&&&&%&&&&@.                              
                                    *&&&&&&@.
                                    


Web server at port ${port} is running..
Path to project folder: ${repo}`);


