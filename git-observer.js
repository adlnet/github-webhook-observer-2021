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

/***
 * Repo config
 **/
const args = process.argv;
const repo = args[2] || "../path-to-project-folder";
const secret = args[3] || "git-observer-secret";
const port = args[4] || 8000;
const rebuild = args[5] || "rebuild.sh"

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
            execSync(`cd ${repo} && git pull && sudo docker ps`);

            //Github headers list the files(including full path) changed from last commit in array of strings.
            let body = JSON.parse(chunk);
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
                execSync(`cd ${repo} && sudo bash ${rebuild}`);

                //Rebuild only the new ones and restart nginx 
            } else if (containersToRebuild.length > 0) {
                containersToRebuild.forEach(service => {
                    execSync(`cd ${repo} && sudo docker-compose stop ${service}`);
                    execSync(`cd ${repo} && sudo docker-compose rm ${service}`);
                });
                //Always restart nginx last
                execSync(`cd ${repo} && sudo docker-compose up -d --no-deps --build `);
                execSync(`cd ${repo} && sudo docker-compose restart nginx`);

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


