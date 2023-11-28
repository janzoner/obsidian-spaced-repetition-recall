import { CachedMetadata, FrontMatterCache, Notice, TFile } from "obsidian";
import { TopicPath } from "src/TopicPath";
import {
    LEGACY_SCHEDULING_EXTRACTOR,
    MULTI_SCHEDULING_EXTRACTOR,
    SCHEDULING_INFO_REGEX,
    YAML_FRONT_MATTER_REGEX,
    YAML_TAGS_REGEX,
} from "src/constants";
import SRPlugin from "src/main";
import { isIgnoredPath } from "src/reviewNote/review-note";
import { SRSettings } from "src/settings";
import { escapeRegexString } from "src/util/utils";
import { DataStore } from "./data";
import { Tags } from "src/tags";
import { DataSyncer } from "./dataSyncer";

import { Stats } from "src/stats";
import { DateUtils } from "src/util/utils_recall";

const ROOT_DATA_PATH = "./tracked_files.json";
// const PLUGIN_DATA_PATH = "./.obsidian/plugins/obsidian-spaced-repetition-recall/tracked_files.json";

// recall trackfile
export enum DataLocation {
    PluginFolder = "In Plugin Folder",
    RootFolder = "In Vault Folder",
    SpecifiedFolder = "In the folder specified below",
    SaveOnNoteFile = "Save On Note File",
}

export const locationMap: Record<string, DataLocation> = {
    "In Vault Folder": DataLocation.RootFolder,
    "In Plugin Folder": DataLocation.PluginFolder,
    "In the folder specified below": DataLocation.SpecifiedFolder,
    "Save On Note File": DataLocation.SaveOnNoteFile,
};

export class LocationSwitch {
    public plugin: SRPlugin;
    private settings: SRSettings;

    revTag: string;

    constructor(plugin: SRPlugin, settings: SRSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.revTag = [this.settings.tagsToReview[0], plugin.store.defaultDackName]
            .join("/")
            .substring(1);
    }

    /**
     * getStorePath.
     *
     * @returns {string}
     */
    getStorePath(): string {
        return getStorePath(this.plugin.manifest.dir, this.settings);
    }

    /**
     * moveStoreLocation.
     *
     * @returns {boolean}
     */
    async moveStoreLocation(): Promise<boolean> {
        const adapter = app.vault.adapter;
        const store = DataStore.getInstance();

        const newPath = this.getStorePath();
        if (newPath === store.dataPath) {
            return false;
        }
        let exist = false;
        store.verify(newPath).then(async (v) => {
            exist = v;
            if (exist) {
                const adapter = app.vault.adapter;
                const suffix = "-" + new Date().toISOString().replace(/[:.]/g, "");
                await adapter.rename(newPath, newPath + suffix).then(() => {
                    console.debug("orginal file: " + newPath + " renamed to: " + newPath + suffix);
                });
            }
        });

        try {
            await store.save(newPath);
            adapter.remove(store.dataPath).then(
                () => {
                    store.setdataPath(newPath);
                    new Notice("Successfully moved data file!");
                    return true;
                },
                (e) => {
                    store.setdataPath(newPath);
                    new Notice("Unable to delete old data file, please delete it manually.");
                    console.log(e);
                    return true;
                },
            );
        } catch (e) {
            new Notice("Unable to move data file!");
            console.log(e);
            return false;
        }
    }

    /**
     * converteNoteSchedToTrackfile
     *
     */
    async converteNoteSchedToTrackfile(dryrun: boolean = false, newLocation?: DataLocation) {
        const plugin = this.plugin;
        // const store = plugin.store;
        const store = DataStore.getInstance();
        const settings = plugin.data.settings;
        // const orgLocation = settings.dataLocation;
        if (dryrun) {
            if (newLocation) {
                settings.dataLocation = newLocation;
            }
        }
        await store.load();

        // await plugin.sync_Algo();

        const notes: TFile[] = app.vault.getMarkdownFiles();
        for (const noteFile of notes) {
            if (isIgnoredPath(this.settings.noteFoldersToIgnore, noteFile.path)) {
                continue;
            }

            let deckname = Tags.getNoteDeckName(noteFile, this.settings);
            let topicPath: TopicPath = plugin.findTopicPath(plugin.createSrTFile(noteFile));
            let fileText: string = "";
            let fileChanged = false;
            if (topicPath.hasPath) {
                fileText = await app.vault.read(noteFile);
                if (topicPath.formatAsTag().includes(this.revTag)) {
                    deckname = store.defaultDackName;
                    topicPath = new TopicPath([deckname]);
                    fileText = delDefaultTag(fileText, this.revTag);
                    fileChanged = true;
                }
            }

            if (deckname !== null) {
                const fileCachedData = app.metadataCache.getFileCache(noteFile) || {};
                fileText = await _convertFrontMatter(noteFile, fileCachedData, deckname, fileText);
                if (fileText == null) {
                    console.debug("_convertFrontMatter: fileText null: ");
                    throw new Error("_convertFrontMatter fileText null: " + fileText);
                }
                if (SCHEDULING_INFO_REGEX.test(fileText)) {
                    console.error(
                        "still have SCHEDULING_INFO_REGEX in fileText:\n",
                        noteFile.path,
                        fileText,
                    );
                    throw new Error("_convertFrontMatter failed: \n" + fileText);
                }
                fileChanged = true;
            }

            if (topicPath.hasPath) {
                fileText = await _convertCardsSched(noteFile, fileText, topicPath.path[0]);
                if (fileText == null) {
                    console.debug("fileText null");
                    throw new Error(fileText);
                }
                if (
                    MULTI_SCHEDULING_EXTRACTOR.test(fileText) ||
                    LEGACY_SCHEDULING_EXTRACTOR.test(fileText)
                ) {
                    console.error("still have cardsched in fileText:\n", noteFile.path, fileText);
                    throw new Error("_convertCardsSched failed: \n" + fileText);
                }
                fileChanged = true;
            }

            if (!dryrun && fileChanged) {
                if (fileText == null) {
                    console.debug("fileText null");
                    throw new Error(fileText);
                }
                await app.vault.modify(noteFile, fileText);
                // console.debug("_convert fileChanged end :\n", fileText);
            }
        }

        const msg = "converteNoteSchedToTrackfile success!";
        if (dryrun) {
            await plugin.sync();
            await store.load();
            settings.dataLocation = DataLocation.SaveOnNoteFile;
        } else {
            await store.save();
            new Notice(msg);
        }
        console.log(msg);

        async function _convertCardsSched(note: TFile, fileText: string, deckName: string) {
            // console.debug("_convertCardsSched: ", note.basename);
            const trackedFile = store.getTrackedFile(note.path);
            // let fileText: string = await app.vault.read(note);
            let fileChanged = false;
            trackedFile.syncNoteCardsIndex(fileText, settings, (cardText, cardinfo) => {
                let scheduling: RegExpMatchArray[] = [
                    ...cardText.matchAll(MULTI_SCHEDULING_EXTRACTOR),
                ];
                if (scheduling.length === 0)
                    scheduling = [...cardText.matchAll(LEGACY_SCHEDULING_EXTRACTOR)];
                if (scheduling.length > 0) {
                    DataSyncer.setTrackfileCardSched(
                        trackedFile,
                        deckName,
                        cardinfo.lineNo,
                        cardinfo.cardTextHash,
                        scheduling.length,
                        scheduling,
                    );
                    // console.debug(cardinfo.lineNo, scheduling);

                    const newCardText = updateCardSchedXml(
                        cardText,
                        settings.cardCommentOnSameLine,
                    );
                    const replacementRegex = new RegExp(escapeRegexString(cardText), "gm");
                    fileText = fileText.replace(replacementRegex, () => newCardText);
                    fileChanged = true;
                }
            });

            // if (fileChanged) {
            //     // await app.vault.modify(note, fileText);
            //     console.debug("_convertCardsSched end :\n", fileText);
            // }
            return fileText;
        }

        async function _convertFrontMatter(
            note: TFile,
            fileCachedData: CachedMetadata,
            deckname: string,
            fileText: string,
        ) {
            console.debug("_convertFrontMatter");
            // const fileCachedData = app.metadataCache.getFileCache(note) || {};
            const frontmatter: FrontMatterCache | Record<string, unknown> =
                fileCachedData.frontmatter || {};
            const sched = getReviewNoteHeaderData(frontmatter);
            if (sched != null) {
                // console.debug("converteNoteSchedToTrackfile find:", note.path);
                if (!store.isTracked(note.path)) {
                    store.trackFile(note.path, deckname, false);
                }
                const item = store.getItemsOfFile(note.path)[0];
                // const id = store.getFileId(note.path);
                // store.reviewId(id, opts[1]);
                item.updateSched(sched, true);
                fileText = updateNoteSchedFrontHeader(fileText);
                // console.debug("_convertFrontMatter end :\n", fileText);
            }
            return fileText;
        }
    }

    /**
     *converteTrackfileToNoteSched
     */
    async converteTrackfileToNoteSched(dryrun: boolean = false) {
        const plugin = this.plugin;
        const store = plugin.store;

        plugin.syncLock = true;
        plugin.noteStats = new Stats();
        plugin.cardStats = new Stats();

        const tracked_files = store.data.trackedFiles;
        for (const tkfile of tracked_files) {
            if (tkfile == null) {
                continue;
            }
            // if (ReviewNote.isIgnored(this.settings.noteFoldersToIgnore, tkfile.path)) {
            //     continue;
            // }

            let exists = await store.verify(tkfile.path);
            if (!exists) {
                // in case file moved away.
                exists = store.findMovedFile(tkfile);
            }
            if (exists) {
                const id = tkfile.items["file"];
                const item = store.getItembyID(id);
                const note = app.vault.getAbstractFileByPath(tkfile.path) as TFile;
                const deckPath: string[] = plugin.findTopicPath(plugin.createSrTFile(note)).path;
                let fileText: string = await app.vault.read(note);
                let fileChanged = false;
                if (deckPath.length !== 0) {
                    tkfile.syncNoteCardsIndex(fileText, this.settings, (cardText, cardinfo) => {
                        if (cardinfo == null || cardinfo?.itemIds == null) {
                            return;
                        }
                        const ids = cardinfo.itemIds;
                        ids.sort((a: number, b: number) => a - b);
                        const scheduling: RegExpMatchArray[] = [];
                        ids.forEach((id: number) => {
                            const citem = store.getItembyID(id);
                            const sched = citem.getSched(false, false);
                            // ignore new add card
                            if (sched != null) {
                                scheduling.push(sched);
                            }
                            plugin.cardStats.updateStats(citem, DateUtils.EndofToday);
                        });
                        const newCardText = updateCardSchedXml(
                            cardText,
                            this.settings.cardCommentOnSameLine,
                            scheduling,
                        );
                        const replacementRegex = new RegExp(escapeRegexString(cardText), "gm");
                        fileText = fileText.replace(replacementRegex, () => newCardText);
                        fileChanged = true;
                    });
                }
                // console.debug("_convert CardsSched end :\n", fileText);
                if (item?.isDue) {
                    // let due: number, ease: number, interval: number;
                    const ret = item.getSched(false, false);
                    if (ret != null) {
                        // if(item.deckName === store.defaultDackName){

                        // }
                        fileText = updateNoteSchedFrontHeader(fileText, ret);
                        fileChanged = true;
                        // console.debug("converteTrackfileToNoteSched: " + tkfile.path, fileText);
                    }
                    plugin.noteStats.updateStats(item, DateUtils.EndofToday);
                    // console.debug(tkfile.path, plugin.noteStats.youngCount);
                } else if (item?.isNew) {
                    plugin.noteStats.incrementNew();
                }
                if (item?.deckName === store.defaultDackName) {
                    fileText = addDefaultTagtoNote(fileText, this.revTag);
                    fileChanged = true;
                }
                if (!dryrun && fileChanged) {
                    if (fileText == null) {
                        console.debug("fileText null");
                        throw new Error(fileText);
                    }
                    await app.vault.modify(note, fileText);
                }
            }
        }
        plugin.syncLock = false;
        const msg = "converteTrackfileToNoteSched success!";
        if (dryrun) {
            // const settings = plugin.data.settings;
            // const orgLocation = settings.dataLocation;
            // settings.dataLocation = DataLocation.SaveOnNoteFile;
            // await plugin.sync();
            // settings.dataLocation = orgLocation;
        } else {
            new Notice(msg);
        }
        console.log(msg);
    }

    compare(before: Stats, after: Stats, prefix: string) {
        let ntc = false;
        for (const keyS in before) {
            const key = keyS as keyof typeof before;
            if (!(before[key] instanceof Object) && before[key] !== after[key]) {
                console.error("%s %s before: %d, after: %d", prefix, key, before[key], after[key]);
                ntc = true;
            }
        }
        return ntc;
    }

    createTable(Stats: Stats, afterStats: Stats) {
        const title =
            "Location | new | onDue | yung | mature \n\
            ---|---|---|---|---\n";
        const before = `before|${Stats.newCount} |${Stats.onDueCount} |${Stats.youngCount} |${Stats.matureCount}\n`;
        const after = `after|${afterStats.newCount} |${afterStats.onDueCount} |${afterStats.youngCount} |${afterStats.matureCount}\n`;
        return title + before + after;
    }
}

/**
 *  get ReviewNote frontmatter Data from notefile.
 *
 * @param frontmatter
 * @returns number[] | [0, due, interval, ease];
 */
function getReviewNoteHeaderData(frontmatter: FrontMatterCache): number[] {
    // file has scheduling information
    if (
        Object.prototype.hasOwnProperty.call(frontmatter, "sr-due") &&
        Object.prototype.hasOwnProperty.call(frontmatter, "sr-interval") &&
        Object.prototype.hasOwnProperty.call(frontmatter, "sr-ease")
    ) {
        const dueUnix: number = window
            .moment(frontmatter["sr-due"], ["YYYY-MM-DD", "DD-MM-YYYY", "ddd MMM DD YYYY"])
            .valueOf();
        const interval: number = frontmatter["sr-interval"] as number;
        const ease: number = frontmatter["sr-ease"] as number;
        const sched = [null, dueUnix, interval, ease];
        return sched;
    } else {
        console.log(
            "getReviewNoteHeaderData --> note: %s doesn't have sr frontmatter. ",
            frontmatter,
        );
        return null;
    }
}

/**
 * updateNoteSchedFrontHeader, if sched == null, delete sched info in frontmatter.
 * @param note TFile
 * @param fileText: string
 * @param sched [, due, interval, ease] | null
 */
export function updateNoteSchedFrontHeader(fileText: string, sched?: RegExpMatchArray) {
    // update yaml schedule
    // const plugin = this.plugin;
    let schedString = "";
    if (sched != null) {
        const [, dueString, interval, ease] = sched;
        // const dueString: string = window.moment(due).format("YYYY-MM-DD");
        schedString = `sr-due: ${dueString}\nsr-interval: ${interval}\n` + `sr-ease: ${ease}\n`;
    } else {
        schedString = "";
    }

    // check if scheduling info exists
    if (SCHEDULING_INFO_REGEX.test(fileText)) {
        const schedulingInfo = SCHEDULING_INFO_REGEX.exec(fileText);
        if (schedulingInfo[1].length || schedulingInfo[5].length) {
            fileText = fileText.replace(
                SCHEDULING_INFO_REGEX,
                `---\n${schedulingInfo[1]}${schedString}` + `${schedulingInfo[5]}---\n`,
            );
        } else if (schedString.length > 0) {
            fileText = fileText.replace(SCHEDULING_INFO_REGEX, `---\n${schedString}---\n`);
        } else {
            fileText = fileText.replace(SCHEDULING_INFO_REGEX, "");
        }
    } else if (YAML_FRONT_MATTER_REGEX.test(fileText)) {
        // new note with existing YAML front matter
        const existingYaml = YAML_FRONT_MATTER_REGEX.exec(fileText);
        fileText = fileText.replace(
            YAML_FRONT_MATTER_REGEX,
            `---\n${existingYaml[1]}${schedString}---`,
        );
    } else {
        fileText = `---\n${schedString}---\n${fileText}`;
    }
    return fileText;
}

/**
 * updateCardSchedXml, if have scheduling, update card sched in note. else delete it.
 * @param cardText
 * @param scheduling
 * @param cardCount
 * @returns
 */
export function updateCardSchedXml(
    cardText: string,
    cardCommentOnSameLine: boolean = true,
    scheduling?: RegExpMatchArray[],
    cardCount?: number,
) {
    let sep: string = cardCommentOnSameLine ? " " : "\n";
    let schedString = sep + "<!--SR:";
    const headerReg = /<!--SR:/gm;
    // const headerReg = new RegExp(schedString, "gm");
    const hRegex = headerReg.exec(cardText); // .lastIndexOf(sep+"<!--SR:");
    if (hRegex == null) {
        // Override separator if last block is a codeblock
        if (cardText.endsWith("```") && sep !== "\n") {
            sep = "\n";
        }
    } else {
        // const len = cardText.length - hRegex.index; // .lastIndexOf(sep+"<!--SR:"); < is \x3C escape
        // Override separator if last block is a codeblock
        if (cardText.endsWith("```", hRegex.index - 1) && sep !== "\n") {
            sep = "\n";
        }
    }
    if (scheduling != null && scheduling.length > 0) {
        schedString = sep + "<!--SR:";

        if (cardCount == null) {
            cardCount = scheduling.length;
        } else {
            cardCount = Math.min(cardCount, scheduling.length);
            console.debug("cardCount:", cardCount);
        }
        for (let i = 0; i < cardCount; i++) {
            schedString += `!${scheduling[i][1]},${Number(scheduling[i][2]).toFixed(0)},${Number(
                scheduling[i][3],
            ).toFixed(0)}`;
        }
        schedString += "-->";
    } else {
        schedString = "";
    }

    // const idxSched: number = cardText.lastIndexOf(sep + "<!--SR:");
    let newCardText: string;
    if (hRegex == null) {
        newCardText = cardText + schedString;
    } else {
        newCardText = cardText.substring(0, hRegex.index).trimEnd();
        newCardText += schedString;
    }

    // const replacementRegex = new RegExp(escapeRegexString(cardText), "gm");
    // fileText = fileText.replace(replacementRegex, () => newCardText);
    // fileChanged = true;
    // console.debug("newCardText: \n", newCardText);
    return newCardText;
}

function addDefaultTagtoNote(fileText: string, revTag: string) {
    // check if scheduling info exists
    if (YAML_TAGS_REGEX.test(fileText)) {
        const tags = YAML_TAGS_REGEX.exec(fileText);

        const originTags = tags[2];
        let newTags = "";
        if (!originTags.includes(revTag)) {
            if (originTags.includes("\n")) {
                newTags = [originTags, revTag].join("\n  - ");
            } else {
                newTags = [originTags, revTag].join(", ");
            }
            fileText = fileText.replace(
                YAML_TAGS_REGEX,
                `---\n${tags[1]}tags:${newTags}\n` + `${tags[3]}---`,
            );
        }
    } else if (YAML_FRONT_MATTER_REGEX.test(fileText)) {
        // new note with existing YAML front matter
        const existingYaml = YAML_FRONT_MATTER_REGEX.exec(fileText);
        fileText = fileText.replace(
            YAML_FRONT_MATTER_REGEX,
            `---\n${existingYaml[1]}tags: ${revTag}\n---`,
        );
    } else {
        fileText = `---\ntags: ${revTag}\n---\n${fileText}`;
    }
    return fileText;
}

export function delDefaultTag(fileText: string, revTag: string) {
    // check if scheduling info exists
    if (YAML_TAGS_REGEX.test(fileText)) {
        const tags = YAML_TAGS_REGEX.exec(fileText);

        const originTags = tags[2];
        let newTags = originTags;
        if (originTags.includes(revTag)) {
            if (originTags.includes(",")) {
                newTags = originTags.replace(revTag + ",", "");
                newTags = newTags.replace(RegExp(", ?" + revTag), "");
            }
            if (originTags.includes("\n")) {
                newTags = newTags.replace(RegExp("\n\\s+?-\\s+?" + revTag), "");
            }

            if (newTags.trim() === revTag) {
                newTags = "";
            } else if (newTags.trimEnd().length > 0) {
                newTags = "tags:" + newTags + "\n";
            }
            if (newTags.includes(revTag) || tags[3].includes(revTag)) {
                throw new Error("delDefaultTag still have defaultTag" + newTags + tags[3]);
            }

            if (tags[1].length > 0 || tags[3].length > 0 || newTags.length > 0) {
                fileText = fileText.replace(
                    YAML_TAGS_REGEX,
                    `---\n${tags[1]}` + `${newTags}` + `${tags[3]}---`,
                );
            } else {
                fileText = fileText.replace(YAML_TAGS_REGEX, "");
            }
        }
    }
    return fileText;
}

/**
 * getStorePath.
 *
 * @returns {string}
 */
export function getStorePath(manifestDir: string, settings: SRSettings): string {
    const dir = manifestDir;
    const dataLocation = settings.dataLocation;
    if (dataLocation == DataLocation.PluginFolder) {
        // return PLUGIN_DATA_PATH;
        return dir + ROOT_DATA_PATH.substring(1);
    } else if (dataLocation == DataLocation.RootFolder) {
        return ROOT_DATA_PATH;
    } else if (dataLocation == DataLocation.SpecifiedFolder) {
        return settings.customFolder;
    } else if (dataLocation == DataLocation.SaveOnNoteFile) {
        // return PLUGIN_DATA_PATH;
        return dir + ROOT_DATA_PATH.substring(1);
    }
}
