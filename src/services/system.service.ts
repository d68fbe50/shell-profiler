import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as chalk from 'chalk';
import * as process from 'process';
import * as child_process from 'child_process';

import { HELP } from '../configs/help.configs';
import { GENERAL } from '../configs/general.configs';

import { ItemType } from '../enums/item-type.enum';

import { ProfilerData } from '../entities/ProfilerData.entity';
import { ProfilerAuth } from '../entities/ProfilerAtuh.entity';
import { ProfilerItem } from '../entities/ProfilerItem.entity';

import { UI } from './ui.service';
import { RmdirRecursive } from './rmdir-recursive.service';
import { PersistanceService } from './persisance.service';
import { PersistanceItemType } from '../enums/persistance-item-type.enum';

export class SystemService {

    public get aliases(): ProfilerItem[] {
        const result = (<ProfilerData>PersistanceService.getItem(PersistanceItemType.profilerData));
        return !result.aliases ? [] : result.aliases.sort((a, b) => a.name.length - b.name.length);
    }

    public get functions(): ProfilerItem[] {
        const result = (<ProfilerData>PersistanceService.getItem(PersistanceItemType.profilerData))
        return !result.functions ? [] : result.functions.sort((a, b) => a.name.length - b.name.length);
    }

    public help() {
        const set: any = [];
        HELP.forEach(h => {
            set.push({ key: h.command, value: h.options });
        });

        UI.printKeyValuePairs(set);
    }

    public init(token: string, username: string, usrBashrcPath: string) {
        if (!fs.existsSync(usrBashrcPath)) {
            console.log();
            UI.error('The path provided for the bashrc file is not valid.');
            return;
        }

        process.chdir(os.homedir());
        if (fs.existsSync(GENERAL.profilerDataDirectory)) {
            RmdirRecursive.rmdirRec(GENERAL.profilerDataDirectory);
        }

        this.initializeCoreFiles();
        this.setGithubToken(token);
        this.setGithubUsername(username);
        this.setUserBashrcFilePath(usrBashrcPath);

        //  Set the sourcing of the shell_profiler bashrc on the main bashrc file 
        let source_path = '';
        let usrBashrcFile = fs.readFileSync(usrBashrcPath, { encoding: 'UTF-8' }).toString();

        if (os.platform() === 'win32') {
            console.log(chalk.yellow('Converting path to UNIX-like for sourcing.'));

            const username_folder = os.userInfo().username;
            source_path = `/c/Users/${username_folder}/${GENERAL.profilerDataDirectory}/${GENERAL.profilerBashFile}`
        } else {
            source_path = os.homedir() + path.sep + GENERAL.profilerDataDirectory + path.sep + GENERAL.profilerBashFile;
        }

        usrBashrcFile += `\n#ShellProfiler source. Do not remove this.\nsource ${source_path}`;
        fs.writeFileSync(usrBashrcPath, usrBashrcFile, { encoding: 'UTF-8' });

        UI.success('ShellProfiler has been successfully initialized!');
    }

    public setGithubToken(token: string) {
        if (!this.checkProfilerDataIntegrity()) {
            this.initializeCoreFiles();
        }

        const auth: ProfilerAuth = <ProfilerAuth>PersistanceService.getItem(PersistanceItemType.authData);
        auth.githubToken = token;

        PersistanceService.setItem(PersistanceItemType.authData, auth);
    }

    public setGithubUsername(username: string) {
        if (!this.checkProfilerDataIntegrity()) {
            this.initializeCoreFiles();
        }

        const auth: ProfilerAuth = <ProfilerAuth>PersistanceService.getItem(PersistanceItemType.authData);
        auth.githubUsername = username;

        PersistanceService.setItem(PersistanceItemType.authData, auth);
    }

    public setUserBashrcFilePath(filePath: string) {
        if (!this.checkProfilerDataIntegrity()) {
            this.initializeCoreFiles();
        }

        process.chdir(os.homedir() + path.sep + GENERAL.profilerDataDirectory);
        const profilerData: ProfilerData = JSON.parse(fs.readFileSync(GENERAL.profilerDataFile, { encoding: 'UTF-8' }));
        profilerData.userBashrcFilePath = filePath;

        PersistanceService.setItem(PersistanceItemType.profilerData, profilerData);
    }

    public upsertAlias(alias: ProfilerItem) {

        if (!this.checkProfilerDataIntegrity()) {
            this.initializeCoreFiles();
        }

        let updated = false;
        const profilerData: ProfilerData = <ProfilerData>PersistanceService.getItem(PersistanceItemType.profilerData);
        if (!!profilerData && !profilerData.aliases) {
            profilerData.aliases = [];
        }
        if (!!profilerData.aliases.find(a => a.name === alias.name.trim().toLowerCase())) {
            profilerData.aliases.forEach((a, i) => {
                if (a.name === alias.name.toLowerCase().trim()) {
                    profilerData.aliases[i].command = alias.command;
                    updated = true;
                }
            });
        } else {
            profilerData.aliases.push(alias);
        }

        PersistanceService.setItem(PersistanceItemType.profilerData, profilerData);

        console.log();
        UI.success(updated ? 'Alias updated successfully!' : 'Alias added successfully!');
        UI.warn('Remember that you have to restart your shell in order to use this alias');
    }

    public upsertFunc(func: ProfilerItem) {
        if (!this.checkProfilerDataIntegrity()) {
            this.initializeCoreFiles();
        }

        let updated = false;
        const profilerData: ProfilerData = <ProfilerData>PersistanceService.getItem(PersistanceItemType.profilerData);
        if (!!profilerData && !profilerData.functions) {
            profilerData.functions = [];
        }
        if (!!profilerData.functions.find(f => f.name === func.name.trim().toLowerCase())) {
            profilerData.functions.forEach((f, i) => {
                if (f.name === func.name.toLowerCase().trim()) {
                    profilerData.functions[i].command = func.command;
                    updated = true;
                }
            });
        } else {
            profilerData.functions.push(func);
        }

        PersistanceService.setItem(PersistanceItemType.profilerData, profilerData);

        console.log();
        UI.success(updated ? 'Function updated successfully!' : 'Function added successfully!');
        UI.warn('Remember that you have to restart your shell in order to use this function');
    }

    public deleteItem(type: ItemType, id: string) {
        if (type === ItemType.alias) {

        }
        if (type === ItemType.function) { }
        if (type === ItemType.export) { }
    }

    public checkProfilerDataIntegrity() {
        return PersistanceService.checkFilesIntegrity();
    }

    private initializeCoreFiles() {
        console.log(chalk.yellow('Initializing ShellProfiler...'));

        const profilerAuth = new ProfilerAuth();
        const profilerData = new ProfilerData();
        const rawProfileData = '';

        profilerAuth.githubToken = null;
        profilerAuth.githubUsername = null;

        profilerData.aliases = [];
        profilerData.functions = [];
        profilerData.gistName = null;
        profilerData.userBashrcFilePath = null;

        fs.mkdirSync(GENERAL.profilerDataDirectory);
        PersistanceService.setItem(PersistanceItemType.authData, profilerAuth);
        PersistanceService.setItem(PersistanceItemType.profilerData, profilerData);
        PersistanceService.setItem(PersistanceItemType.rawProfileData, rawProfileData);
    }
}
