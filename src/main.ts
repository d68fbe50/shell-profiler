#! /usr/bin/env node

import 'rxjs/add/operator/filter';

import * as os from 'os';
import * as chalk from 'chalk';
import * as process from 'process';
import * as child_process from 'child_process';

import { AcceptedOption } from './entities/AcceptedOption.entity';
import { DispatcherReturnSet } from './entities/DispatcherReturnSet.entity';

import { UI } from './services/ui.service';
import { SystemService } from './services/system.service';
import { GitHubService } from './services/github.service';
import { UniqueIdUtility } from './services/UniqueID.service';
import { PersistanceService } from './services/persisance.service';
import { ProfilerData } from './entities/ProfilerData.entity';
import { PersistanceItemType } from './enums/persistance-item-type.enum';
import { ItemType } from './enums/item-type.enum';
import { GENERAL } from './configs/general.configs';
import { GistCreationResult } from './entities/GistCreationResult.entity';
import { ListGistsResult } from './entities/ListGistsResult.entity';
import { ProfilerAuth } from './entities/ProfilerAtuh.entity';
import { CoreCommands } from './enums/core-commands.enum';
import { ProfilerItem } from './entities/ProfilerItem.entity';

export class ShellProfiler {
    private args: string[];
    private sys: SystemService;
    private github: GitHubService;

    public constructor() {
        this.sys = new SystemService();
        this.github = new GitHubService();
    }

    /**
     * Starts ShellProfiler
     */
    public start() {
        this.cleanupArgs();

        if (this.args.length) {
            this.dispatch();
            return;
        }

        this.sys.help();
    }

    /**
     * Based on the input recieved, it dispatches to the right method
     */
    private dispatch() {
        if (this.args[0] === CoreCommands.init) {
            this.handlePreInitCall();
            return;
        }
        if (this.args[0] === CoreCommands.stat) {
            this.handleStatCall();
            return;
        }
        if (this.args[0] === CoreCommands.ls) {
            this.handleLsCall();
            return;
        }
        if (this.args[0] === CoreCommands.set) {
            this.handleSetCall();
            return;
        }
        if (this.args[0] === CoreCommands.del) {
            this.handleDelCall();
            return;
        }

        this.sys.help();
    }

    /**
     * Checks if the user is using WINDOWS.
     * If so, it asks if in a domain. 
     * [Node has a problem detecting the domain user folder name]
     */
    private handlePreInitCall() {
        if (this.sys.isWindows) {
            UI.askUserInput(chalk.yellow('WINDOWS DETECTED: Are you part of a Domain? Y/N '), answer => {
                if (answer.trim().toLowerCase() === 'y') {
                    UI.askUserInput(chalk.yellow('Type your domain user folder name: '), domainUserFolderName => {
                        this.handleRealInitCall(domainUserFolderName);
                    });
                }

                if (answer.trim().toLowerCase() === 'n') {
                    this.handleRealInitCall();
                }

                if (answer.trim().toLowerCase() !== 'n' && answer.trim().toLowerCase() !== 'y') {
                    UI.error('Invalid answer.');
                    this.dispatch();
                }
            });
        } else {
            this.handleRealInitCall();
        }
    }

    /**
     * Checks that all the files and gists SP needs are OK
     */
    private handleStatCall() {
        if (this.sys.checkProfilerDataIntegrity()) {
            UI.success('ShellProfiler is happy! :)');
            return;
        }

        UI.error('There are issues with your configuration. Run the init script to make ShellProfiler happy again');
    }

    /**
     * Lists elements.
     * Given a flag, it lists all the elements of that kind
     */
    private handleLsCall() {
        if (!this.checkExtraOptionsPresence([1])) {
            return;
        }

        const acceptedOptions = [
            { option: '--f' },
            { option: '--a' },
            { option: '--func' },
            { option: '--alias' },
            { option: '--profile' }
        ];
        const extractionResult = this.extractOptionsAndValues(1, acceptedOptions);
        if (!extractionResult) {
            return;
        }
        if (extractionResult.option.indexOf('--alias') !== -1 || extractionResult.option.indexOf('--a') !== -1) {
            this.handleAliasListCall();
        }
        if (extractionResult.option.indexOf('--func') !== -1 || extractionResult.option.indexOf('--f') !== -1) {
            this.handleFunctionListCall();
        }
        if (extractionResult.option.indexOf('--profile') !== -1) {
            this.handleGetProfileNameCall();
        }
    }

    /**
     * Creates a new element
     * Given a flag, it creates an element of that type.
     * The name, description and body are required and common for all type of elements
     */
    private handleSetCall() {
        if (!this.checkExtraOptionsPresence([1])) {
            return;
        }

        const acceptedOptions = [
            { option: '--func' },
            { option: '--f' },
            { option: '--alias' },
            { option: '--a' },
            { option: '--profile' },
            { option: '--token', mustHaveValue: true },
            { option: '--username', mustHaveValue: true }
        ];

        const extractionResult = this.extractOptionsAndValues(1, acceptedOptions);
        if (!extractionResult) {
            return;
        }
        if (extractionResult.option === '--func' || extractionResult.option === '--f') {
            this.handleFunctionSetCall();
        }
        if (extractionResult.option === '--alias' || extractionResult.option === '--a') {
            this.handleAliasSetCall();
        }
        if (extractionResult.option === '--profile') {
            this.handleProfileSetCall();
        }
        if (extractionResult.option.indexOf('--token') !== -1 && extractionResult.value) {
            this.handleTokenSetCall(extractionResult.value);
        }
        if (extractionResult.option.indexOf('--username') !== -1 && extractionResult.value) {
            this.handleUsernameSetCall(extractionResult.value);
        }
    }

    /**
     * Deletes an element
     * Given a flag it lists all the elements of that type.
     * Given a index number, it deletes that element.
     * Given a string of indexes numbers comma separated it deletes multiple elements.
     */
    private handleDelCall() {
        if (!this.checkExtraOptionsPresence([1])) {
            return;
        }

        const acceptedOptions = [
            { option: '--alias' },
            { option: '--a' },
            { option: '--func' },
            { option: '--f' }
        ];

        const extractionResult = this.extractOptionsAndValues(1, acceptedOptions);
        if (!extractionResult) {
            return;
        }

        [
            {
                type: ItemType.alias,
                options: [acceptedOptions[0], acceptedOptions[1]]
            },
            {
                type: ItemType.function,
                options: [acceptedOptions[2], acceptedOptions[3]]
            }
        ].forEach(it => this.listElementsAndAskForElementToDelete(extractionResult, it.type, it.options));
    }

    private listElementsAndAskForElementToDelete(extractionResult: DispatcherReturnSet, type: ItemType, acceptedOptions: { option: string }[]) {
        if (!this.tryToMatchAOption(extractionResult, acceptedOptions)) {
            return;
        }

        let persistedItems: ProfilerItem[] = [];
        const indexedIds: { key: string, value: string }[] = [];
        if (type === ItemType.alias) {
            persistedItems = (<ProfilerData>PersistanceService.getItem(PersistanceItemType.profilerData)).aliases;
        }
        if (type === ItemType.function) {
            persistedItems = (<ProfilerData>PersistanceService.getItem(PersistanceItemType.profilerData)).functions;
        }

        const keywords = this.generateKeywordsBasedOnType(type);
        if (!persistedItems.length) {
            UI.warn(`No ${keywords.plural} available.`);
            return;
        }

        persistedItems.forEach((a, i) => indexedIds.push({ key: `${i}) ${a.name}`, value: a.desc }));
        UI.printKeyValuePairs(indexedIds);
        UI.askUserInput(`Type the number of the ${keywords.singular} to delete: `, index => {
            if (!persistedItems[index] && !this.isMultipleChoice(index)) {
                UI.error('You must provide a valid number or a comma separated list of numbers');
                this.dispatch();
                return;
            }
            this.deleteItems(index, persistedItems, ItemType.alias);
        });

    }

    private tryToMatchAOption(extractionResult: DispatcherReturnSet, availableOptions: { option: string }[]): boolean {
        return availableOptions.find(ao => extractionResult.option.lastIndexOf(ao.option) !== -1) ? true : false;
    }

    private deleteItems(index: string, items: ProfilerItem[], type: ItemType) {
        if (this.isMultipleChoice(index)) {
            let skippedItems = 0;
            this.extractIdsFromSingleString(index)
                .forEach(idx => {
                    const _index = parseInt(idx);
                    //  If the index to delete is not valid
                    if (!items[_index]) {
                        skippedItems++
                        return;
                    }

                    this.sys.deleteItem(ItemType.alias, items[_index].id);
                });
            if (!skippedItems) {
                UI.print('Deleting elements...');
                return;
            }

            UI.warn(`${skippedItems} elements where skipped from delete. [INVALID INDEX]`);
            return;
        }

        this.sys.deleteItem(ItemType.alias, items[parseInt(index)].id);
    }

    private handleRealInitCall(domainUserFolderName?: string) {
        UI.askUserInput(chalk.green('GitHub authorization token: '), token => {
            UI.askUserInput(chalk.green('GitHub username: '), username => {
                UI.askUserInput(chalk.green('Your bashrc file absolute path: '), bashrc_path => {
                    UI.printKeyValuePairs([
                        { key: 'Token', value: token },
                        { key: 'Username', value: username },
                        { key: 'Bashrc path', value: bashrc_path }
                    ]);
                    UI.askUserInput(chalk.yellow('Do you confirm?') + ' Y/N ', (answer: string) => {
                        if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === '') {
                            this.sys.init(token, username, bashrc_path, domainUserFolderName);
                            this.readProfiles(true);
                            return;
                        }

                        if (answer.toLowerCase().trim() === 'n' || (answer.toLowerCase().trim() !== 'y' && answer.toLowerCase().trim() !== 'n')) {
                            this.dispatch();
                        }
                    })
                });
            });
        });
    }

    private handleAliasListCall() {
        const list: { key: string, value: string }[] = [];
        const result = this.sys.aliases;
        result.forEach(als => {
            list.push({ key: als.name, value: als.desc });
        });

        UI.printKeyValuePairs(list);
    }

    private handleFunctionListCall() {
        const list: { key: string, value: string }[] = [];
        const result = this.sys.functions;
        result.forEach(func => {
            list.push({ key: func.name, value: func.desc });
        });

        UI.printKeyValuePairs(list);
    }

    private handleGetProfileNameCall() {
        const result = this.sys.profileName;
        if (!result) {
            UI.error('No profile name set. Set it with set --profile:name');
            return;
        }

        UI.print('Profile in use: ' + chalk.yellow(result), true);
    }

    private handleTokenSetCall(extractionResultValue: string) {
        this.sys.setGithubToken(extractionResultValue);
        UI.success(`GitHub access token successfully set to "${extractionResultValue}"`);
    }

    private handleUsernameSetCall(extractionResultValue: string) {
        this.sys.setGithubUsername(extractionResultValue);
        UI.success(`Username successfully set to "${extractionResultValue}"`);
    }

    private handleAliasSetCall() {
        UI.askUserInput(chalk.green('Alias name: '), aliasName => {
            UI.askUserInput(chalk.green('Alias description: '), description => {
                UI.askUserInput(chalk.green('Alias body: '), data => {
                    const aliasBody = `alias ${aliasName}="${data}"`;
                    this.sys.upsertAlias({ id: UniqueIdUtility.generateId(), name: aliasName, desc: description, command: aliasBody });
                });
            });
        });
    }

    private handleFunctionSetCall() {
        UI.askUserInput(chalk.green('Function name: '), (funcName) => {
            UI.askUserInput(chalk.green('Function description: '), description => {
                UI.askUserInput(chalk.green('Function body: '), (data) => {
                    const funcBody = `function ${funcName}(){\n\t${data}\n}`;
                    this.sys.upsertFunc({ id: UniqueIdUtility.generateId(), name: funcName, desc: description, command: funcBody });
                });
            });
        });
    }

    private handleProfileSetCall() {
        this.readProfiles();
    }

    private readProfiles(inInitMode?: boolean) {
        UI.print('Reading GitHub stored profiles...');
        this.github
            .listGists()
            .subscribe(res => {
                if (!res.data) {
                    UI.print('No profiles found. Creating a new one...');
                    if (inInitMode) {
                        this.createProfile();
                    }
                }

                if (res.data) {
                    UI.print('At least one profile has been found.');
                    this.selectProfile(res);
                }
            });
    }

    private selectProfile(res: ListGistsResult, inInitMode?: boolean) {
        console.log();
        res.data.forEach((g: any, i: number) => {
            const filename = Object.keys(g.files)[0].split('.')[0];
            UI.print(`${i}) ${chalk.yellow(filename)}`);
        });
        console.log();

        UI.askUserInput('Type the number of the profile you want to use or N for a new one: ', choiche => {
            if (!res.data[choiche] && choiche.toLowerCase().trim() !== 'n') {
                UI.error('Select a valid profile number');
                return;
            }

            if (choiche.toLowerCase().trim() === 'n') {
                this.createProfile();
                return;
            }

            UI.print('Requesting selected profile content from GitHub...');
            this.loadProfile(res.data[choiche], inInitMode);
        });
    }

    private loadProfile(profileData: any, inInitMode?: boolean) {
        const profileName = Object.keys(profileData.files)[0].split('.')[0];
        this.github
            .loadGist(profileData.url)
            .subscribe(res => {
                if (!res.data) {
                    UI.error('Error while loading profile');
                    UI.error(res.error);
                }

                UI.print('Profile content arrived...');
                UI.print('Updating profile in use...');
                const profilerAuth = <ProfilerAuth>PersistanceService.getItem(PersistanceItemType.authData);
                profilerAuth.gistId = JSON.parse(res.data).id;
                PersistanceService.setItem(PersistanceItemType.authData, profilerAuth);

                const profile = <ProfilerData>JSON.parse(JSON.parse(res.data).files[profileName + GENERAL.gistFileExt].content);
                PersistanceService.setItem(PersistanceItemType.profilerData, profile);

                UI.success('Profile in use has been updated to: ' + chalk.yellow(<string>profile.name), true);
                if (inInitMode) {
                    UI.success('ShellProfiler initialization completed!');
                }
            });
    }

    private createProfile() {
        UI.askUserInput('New profile name: ', name => {
            if (!name) {
                name = 'DefaultProfile';
            }
            const profile = <ProfilerData>PersistanceService.getItem(PersistanceItemType.profilerData);

            //  Set the new name, keep tne paths and reset the arrays
            profile.name = name;
            profile.aliases = [];
            profile.functions = [];

            this.github
                .createGist(name + GENERAL.gistFileExt, profile)
                .subscribe((res: GistCreationResult) => {
                    if (res.status === 201) {
                        this.sys.setGistId(res.data.id);
                        UI.success(`Gist created with name: ${name}`);
                        PersistanceService.setItem(PersistanceItemType.profilerData, profile);
                    }
                });
        });
    }

    private checkExtraOptionsPresence(howMany: number[], warnInConsole = true) {
        let allArgsPresent = true;
        howMany.forEach(index => {
            allArgsPresent = !!this.args[index];
        });

        if (!allArgsPresent && warnInConsole) {
            UI.error('Command is missing a/some option/s. Check the correct syntax');
        }

        return allArgsPresent;
    }

    private extractOptionsAndValues(argToWorkOn: number, acceptedOptions: AcceptedOption[], warnInConsole = true): DispatcherReturnSet | null {
        const mainArg = this.args[argToWorkOn];
        const returnSet = new DispatcherReturnSet();
        let matchingOption = acceptedOptions.find(opt => mainArg.indexOf(opt.option) !== -1 ? true : false);

        if (!matchingOption && warnInConsole) {
            UI.error('No matching options found for the given command');
            return null;
        }

        if (matchingOption && matchingOption.mustHaveValue) {
            const mainArgValue = mainArg.split(':')[1];
            if (!mainArgValue) {
                UI.error('This command expects a value. Run the command again with its value');
                return null;
            } else {
                returnSet.option = mainArg;
                returnSet.value = mainArgValue;
            }
        }

        if (matchingOption && !matchingOption.mustHaveValue) {
            returnSet.option = matchingOption.option;
        }

        return returnSet;
    }

    private cleanupArgs() {
        this.args = process.argv;
        this.args.shift();
        this.args.shift();
    }

    //  TODO move to utils?
    private isMultipleChoice(potentialIdsList: string): boolean {
        return potentialIdsList.split(',').length > 1 ? true : false;
    }

    private extractIdsFromSingleString(idsString: string, splittingChar = ','): string[] {
        return idsString.split(splittingChar);
    }

    private generateKeywordsBasedOnType(type: ItemType): { singular: string; plural: string } {
        let keyword: string;
        let keywordPlural: string;

        if (type === ItemType.alias) {
            keyword = 'alias';
            keywordPlural = 'aliases';
        } else {
            keyword = 'function';
            keywordPlural = 'functions';
        }

        return { singular: keyword, plural: keywordPlural };
    }
}

const SP = new ShellProfiler();
SP.start();