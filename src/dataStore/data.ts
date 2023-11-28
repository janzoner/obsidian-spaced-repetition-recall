import { DateUtils } from "src/util/utils_recall";
import { SRSettings } from "../settings";

import { TFile, TFolder, Notice, getAllTags } from "obsidian";

import deepcopy from "deepcopy";
import { FsrsData } from "src/algorithms/fsrs";
import { AnkiData } from "src/algorithms/anki";

import { algorithmNames } from "src/algorithms/algorithms_switch";
import { getStorePath } from "src/dataStore/location_switch";
import { Tags } from "src/tags";
import SrsAlgorithm from "src/algorithms/algorithms";
import { CardInfo, TrackedFile } from "./trackedFile";
import { RepetitionItem } from "./repetitionItem";
import { Queue } from "./queue";

/**
 * SrsData.
 */
export interface SrsData {
    /**
     * @type {Queue}
     */
    queues: Queue;

    /**
     * @type {ReviewedCounts}
     */
    reviewedCounts: ReviewedCounts;
    /**
     * @type {ReviewedCounts}
     */
    reviewedCardCounts: ReviewedCounts;
    /**
     * @type {RepetitionItem[]}
     */
    items: RepetitionItem[];
    /**
     * @type {TrackedFile[]}
     */
    trackedFiles: TrackedFile[];

    /**
     * @type {number}
     */
    mtime: number;
}

export enum RPITEMTYPE {
    NOTE = "note",
    CARD = "card",
}

export type ReviewedCounts = Record<string, { new: number; due: number }>;

/**
 * ReviewResult.
 */
export interface ReviewResult {
    /**
     * @type {boolean}
     */
    correct: boolean;
    /**
     * @type {number}
     */
    nextReview: number;
}

const DEFAULT_SRS_DATA: SrsData = {
    queues: new Queue(),
    reviewedCounts: {},
    reviewedCardCounts: {},
    items: [],
    trackedFiles: [],
    mtime: 0,
};

/**
 * DataStore.
 */
export class DataStore {
    static instance: DataStore;

    /**
     * @type {string}
     */
    private _defaultDeckname = "default";
    /**
     * @type {SrsData}
     */
    data: SrsData;
    /**
     * @type {SRPlugin}
     */
    // plugin: SRPlugin;
    settings: SRSettings;
    // manifestDir: string;
    /**
     * @type {string}
     */
    dataPath: string;

    public static getInstance(): DataStore {
        if (!DataStore.instance) {
            // DataStore.instance = new DataStore();
            throw Error("there is not DataStore instance.");
        }
        return DataStore.instance;
    }

    get defaultDackName() {
        return this._defaultDeckname;
    }

    /**
     *
     * @param settings
     * @param manifestDir
     */
    constructor(settings: SRSettings, manifestDir: string) {
        // this.plugin = plugin;
        this.settings = settings;
        // this.manifestDir = manifestDir;
        this.dataPath = getStorePath(manifestDir, settings);
        DataStore.instance = this;
    }

    toInstances() {
        this.data.trackedFiles.forEach((tf, idx) => {
            tf = TrackedFile.create(tf);
            this.data.trackedFiles[idx] = tf;
            if (tf != null) {
                this.getItembyID(tf.noteId);
                if (tf.hasCards) {
                    tf.cardItems.forEach((cinfo: CardInfo) => {
                        cinfo.itemIds.forEach((id) => {
                            this.getItembyID(id);
                        });
                    });
                }
            }
        });
        this.data.queues = Queue.create(this.data.queues);
    }

    /**
     * load.
     */
    async load(path = this.dataPath) {
        const adapter = app.vault.adapter;

        if (await adapter.exists(path)) {
            const data = await adapter.read(path);
            if (data == null) {
                console.log("Unable to read SRS data!");
                this.data = Object.assign({}, DEFAULT_SRS_DATA);
            } else {
                console.log("Reading tracked files...");
                this.data = Object.assign(Object.assign({}, DEFAULT_SRS_DATA), JSON.parse(data));
                this.data.mtime = await this.getmtime();
            }
        } else {
            console.log("Tracked files not found! Creating new file...");
            this.data = Object.assign({}, DEFAULT_SRS_DATA);
            await this.save();
        }
        this.toInstances();
    }

    /**
     * re load if tracked_files.json updated by other device.
     */
    reLoad() {
        // const now: Date = new Date().getTime();
        this.getmtime().then((mtime) => {
            if (mtime - this.data.mtime > 10) {
                console.debug("reload newer tracked_files.json: ", mtime, mtime - this.data.mtime);
                this.load();
            }
        });
    }
    setdataPath(path = this.dataPath) {
        this.dataPath = path;
    }
    /**
     * save.
     */
    async save(path = this.dataPath) {
        await app.vault.adapter.write(path, JSON.stringify(this.data)).catch((e) => {
            new Notice("Unable to save data file!");
            console.log(e);
            return;
        });
        this.data.mtime = await this.getmtime();
        // if (path !== this.dataPath) {
        //     this.dataPath = path;
        // }
    }

    /**
     * get file modified time. should only set to data.mtime when load.
     * @param path
     * @returns
     */
    async getmtime(path = this.dataPath) {
        const adapter = app.vault.adapter;
        const stat = await adapter.stat(path.normalize());
        if (stat != null) {
            return stat.mtime;
        } else {
            return 0;
        }
    }

    /**
     * Returns total number of items tracked by the SRS.
     * @returns {number}
     */
    items(): number {
        return this.data.items.length;
    }

    /**
     * getFileIndex.
     *
     * @param {string} path
     * @returns {number} ind | -1
     */
    getFileIndex(path: string): number {
        return this.data.trackedFiles.findIndex((val, _ind, _obj) => {
            return val != null && val.path == path;
        });
    }

    getFileId(path: string): number {
        const fileInd = this.getFileIndex(path);
        if (fileInd == -1) {
            return -1;
        }
        const fileId = this.data.trackedFiles[fileInd].items["file"];
        return fileId;
    }

    getTrackedFile(path: string): TrackedFile {
        const ind = this.getFileIndex(path);
        if (ind < 0) {
            return null;
        }
        let tf: TrackedFile = this.data.trackedFiles[ind];
        if (!(tf instanceof TrackedFile)) {
            tf = this.data.trackedFiles[ind] = TrackedFile.create(tf);
        }
        return tf;
    }

    /**
     * Returns whether or not the given file path is tracked by the SRS.
     * @param {string} path
     * @returns {boolean}
     */
    isTracked(path: string): boolean {
        const ind = this.getFileIndex(path);
        const fid = this.getFileId(path);

        return ind >= 0 && fid >= 0;
    }

    /**
     * Returns whether or not the given file path is tracked by the SRS.
     * work for cards query.
     * @param {string} path
     * @returns {boolean}
     */
    isTrackedCardfile(path: string): boolean {
        const ind = this.getFileIndex(path);
        let cardLen = 0;
        if (ind >= 0) {
            const file = this.getFileByIndex(ind);
            if (Object.keys(file).includes("cardItems")) {
                cardLen = file.cardItems.length;
            }
        }
        return cardLen > 0;
    }

    isCardItem(id: number) {
        const item = this.getItembyID(id);
        const file = this.getFileByIndex(item.fileIndex);
        return file.items.file !== id;
    }

    /**
     * Returns when the given item is reviewed next (in hours).
     */
    /**
     * nextReview.
     *
     * @param {number} itemId
     * @returns {number}
     */
    nextReview(itemId: number): number {
        const item = this.getItembyID(itemId);
        if (item == null) {
            return -1;
        }

        const now: Date = new Date();
        return (item.nextReview - now.getTime()) / (1000 * 60 * 60);
    }

    getItembyID(id: number): RepetitionItem {
        if (id < 0) {
            return null;
        }
        let ind = -1;
        let item = this.data.items.find((item: RepetitionItem, idx) => {
            if (item != null && item.ID === id) {
                ind = idx;
                return true;
            }
        });
        if (item != undefined && !(item instanceof RepetitionItem)) {
            item = this.data.items[ind] = RepetitionItem.create(item);
        }
        return item;
    }

    getFileByIndex(idx: number): TrackedFile {
        return this.data.trackedFiles[idx];
    }

    /**
     * getItemsOfFile.
     * todo: note item and cards items?
     * @param {string} path
     * @returns {RepetitionItem[]}
     */
    getItemsOfFile(path: string): RepetitionItem[] {
        const result: RepetitionItem[] = [];
        const file = this.getTrackedFile(path);
        Object.values(file.items).forEach((itemIdx) => {
            result.push(this.getItembyID(itemIdx));
        });
        return result;
    }

    /**
     * getNext. RepetitionItem
     *
     * @returns {RepetitionItem | null}
     */
    getNext(): RepetitionItem | null {
        const id = this.data.queues.getNextId();
        if (id != null) {
            return this.getItembyID(id);
        }

        return null;
    }

    /**
     * getFilePath.
     *
     * @param {RepetitionItem} item
     * @returns {string | null}
     */
    getFilePath(item: RepetitionItem): string | null {
        const trackedFile = this.data.trackedFiles[item.fileIndex];

        return trackedFile?.path ?? null;
    }

    getReviewedCounts() {
        return this.data.reviewedCounts;
    }
    getReviewedCardCounts(): ReviewedCounts {
        return this.data.reviewedCardCounts;
    }

    /**
     * reviewId.
     * update data according to response opt
     * @param {number} itemId
     * @param {string} option
     */
    reviewId(itemId: number, option: string) {
        const item = this.getItembyID(itemId);
        if (item == null) {
            return -1;
        }

        const algorithm = SrsAlgorithm.getInstance();
        if (this.data.queues.isInRepeatQueue(itemId)) {
            const result = algorithm.onSelection(item, option, true);

            this.data.queues.repeatQueue.remove(itemId);
            if (!result.correct) {
                this.data.queues.repeatQueue.push(itemId); // Re-add until correct.
            }
        } else {
            const result = algorithm.onSelection(item, option, false);

            item.nextReview = DateUtils.fromNow(result.nextReview).getTime();
            item.timesReviewed += 1;
            this.data.queues.queue.remove(itemId);
            if (result.correct) {
                item.timesCorrect += 1;
                item.errorStreak = 0;
            } else {
                item.errorStreak += 1;

                if (this.settings.repeatItems) {
                    this.data.queues.repeatQueue.push(itemId);
                }
            }
        }
    }

    /**
     * untrackFilesInFolderPath.
     *
     * @param {string} path
     * @param {boolean} recursive
     */
    untrackFilesInFolderPath(path: string, recursive?: boolean) {
        const folder: TFolder = app.vault.getAbstractFileByPath(path) as TFolder;

        if (folder != null) {
            this.untrackFilesInFolder(folder, recursive);
        }
    }

    /**
     * untrackFilesInFolder.
     *
     * @param {TFolder} folder
     * @param {boolean} recursive
     */
    untrackFilesInFolder(folder: TFolder, recursive?: boolean) {
        let firstCalled = false;
        if (recursive == null) {
            recursive = true;
            firstCalled = true;
        }

        let totalRemoved = 0;
        folder.children.forEach((child) => {
            if (child instanceof TFolder) {
                if (recursive) {
                    totalRemoved += this.untrackFilesInFolder(child, recursive);
                }
            } else if (child instanceof TFile) {
                if (this.isTracked(child.path)) {
                    const removed = this.untrackFile(child.path, false);
                    totalRemoved += removed;
                }
            }
        });
        if (firstCalled) {
            const msg = `在文件夹 ${folder.path} 下，共有 ${totalRemoved} 个文件不再跟踪重复了`;
            new Notice(msg);
            console.log(msg);
        }
        return totalRemoved;
    }

    /**
     * trackFilesInFolderPath.
     *
     * @param {string} path
     * @param {boolean} recursive
     */
    trackFilesInFolderPath(path: string, recursive?: boolean) {
        const folder: TFolder = app.vault.getAbstractFileByPath(path) as TFolder;

        if (folder != null) {
            this.trackFilesInFolder(folder, recursive);
        }
    }

    /**
     * trackFilesInFolder.
     *
     * @param {TFolder} folder
     * @param {boolean} recursive
     */
    trackFilesInFolder(folder: TFolder, recursive?: boolean) {
        if (recursive == null) recursive = true;

        let totalAdded = 0;
        let totalRemoved = 0;
        folder.children.forEach((child) => {
            if (child instanceof TFolder) {
                if (recursive) {
                    this.trackFilesInFolder(child, recursive);
                }
            } else if (child instanceof TFile && child.extension === "md") {
                if (!this.isTracked(child.path)) {
                    const { added, removed } = this.trackFile(child.path, RPITEMTYPE.NOTE, false);
                    totalAdded += added;
                    totalRemoved += removed;
                }
            }
        });

        new Notice("Added " + totalAdded + " new items, removed " + totalRemoved + " items.");
    }

    /**
     * trackFile.
     *
     * @param {string} path
     * @param {string} type? "default" , "card"
     * @param {boolean} notice
     * @returns {{ added: number; removed: number } | null}
     */
    trackFile(
        path: string,
        type?: RPITEMTYPE | string,
        notice?: boolean,
    ): { added: number; removed: number } | null {
        let dname: string;
        let itemtype: RPITEMTYPE = RPITEMTYPE.NOTE;

        if (type === RPITEMTYPE.CARD) {
            itemtype = RPITEMTYPE.CARD;
        } else if (type == undefined || type === RPITEMTYPE.NOTE) {
            itemtype = RPITEMTYPE.NOTE;
            dname = this.defaultDackName;
        } else {
            dname = type as string;
        }
        const trackedFile = new TrackedFile(path, itemtype, dname);

        if (this.getFileIndex(path) < 0) {
            this.data.trackedFiles.push(trackedFile);
        }
        const data = this.updateItems(path, itemtype, dname, notice);
        console.log("Tracked: " + path);
        // this.plugin.updateStatusBar();
        return data;
    }

    /**
     * untrackFile.
     *
     * @param {string} path
     * @param {boolean} notice
     * @returns {number}
     */
    untrackFile(path: string, notice?: boolean): number {
        if (notice == null) notice = true;

        const index = this.getFileIndex(path);

        if (index == -1) {
            return 0;
        }

        const trackedFile = this.getTrackedFile(path);
        const note = app.vault.getAbstractFileByPath(path) as TFile;

        if (note != null && trackedFile?.tags.length > 0) {
            const fileCachedData = app.metadataCache.getFileCache(note) || {};
            const tags = getAllTags(fileCachedData) || [];
            const deckname = Tags.getNoteDeckName(note, this.settings);
            const cardName = Tags.getTagFromSettingTags(tags, this.settings.flashcardTags);
            if (deckname !== null || cardName !== null) {
                // it's taged file, can't untrack by this.
                console.log(path + " is taged file, can't untrack by this.");
                new Notice(
                    "it is taged file, can't untrack by this. You can delete the #review tag in note file.",
                );
                return 0;
            }
        }

        let numItems = 0;

        for (const key in trackedFile.items) {
            const ind = trackedFile.items[key];
            this.unTrackItem(ind);
        }

        //  when file not exist, or doesn't have carditems, del it.
        let nulrstr: string;
        if (note == null) {
            this.data.trackedFiles[index] = null;
            nulrstr = ", because it not exist.";
            numItems++;
        } else {
            // still have cards items, just set fileId = -1
            this.data.trackedFiles[index].items.file = -1;
            numItems++;
        }
        // this.save();         // will be used when plugin.sync_Algo(), which shouldn't
        // this.plugin.updateStatusBar();

        if (notice) {
            new Notice("Untracked " + numItems + " items!");
        }

        console.log("Untracked: " + path + nulrstr);
        return numItems;
    }

    unTrackItem(id: number) {
        this.data.queues.remove(id);
        const item = this.getItembyID(id);
        item.setUntracked();
    }

    get maxItemId() {
        return Math.max(
            ...this.data.items.map((item: RepetitionItem) => {
                return item ? item.ID : 0;
            }),
            this.data.items.length - 1,
        );
    }

    _updateItem(
        id: number = null,
        fileIndex: number,
        itemType: RPITEMTYPE,
        deckName: string,
    ): number {
        if (id < 0) return;
        let item: RepetitionItem;
        const algorithm = SrsAlgorithm.getInstance();

        const newItem = new RepetitionItem(
            id,
            fileIndex,
            itemType,
            deckName,
            algorithm.defaultData(),
        );

        if (id == undefined) {
            newItem.ID = this.maxItemId + 1;
            this.data.items.push(newItem);
        } else {
            item = this.getItembyID(id);
            if (item != null) {
                item.setTracked(fileIndex);
                item.itemType= itemType;
                item.data = Object.assign(algorithm.defaultData(), item.data);
            } else {
                this.data.items.push(newItem);
            }
        }

        return newItem.ID;

        // console.debug(`update items[${id}]:`, newItem);
    }

    /**
     * updateItems.
     *
     * @param {string} path
     * @param {string} type? RPITEMTYPE
     * @param {string} dname? "default" , deckName
     * @param {boolean} notice
     * @returns {{ added: number; removed: number } | null}
     */
    updateItems(
        path: string,
        type?: RPITEMTYPE,
        dname?: string,
        notice?: boolean,
    ): { added: number; removed: number } | null {
        if (notice == null) notice = true;
        if (type == null) type = RPITEMTYPE.NOTE;
        if (dname == null) dname = this.defaultDackName;

        const ind = this.getFileIndex(path);
        if (ind == -1) {
            console.log("Attempt to update untracked file: " + path);
            return;
        }
        const trackedFile = this.getFileByIndex(ind);

        const file = app.vault.getAbstractFileByPath(path) as TFile;
        if (!file) {
            console.log("Could not find file: " + path);
            return;
        }

        let added = 0;
        let removed = 0;

        const newItems: Record<string, number> = {};
        if ("file" in trackedFile.items) {
            newItems["file"] = trackedFile.items["file"];
        } else if (type === RPITEMTYPE.NOTE) {
            const ID = this._updateItem(undefined, ind, type, dname);
            newItems["file"] = ID;
            added += 1;
        } else {
            newItems["file"] = -1;
        }

        for (const key in trackedFile.items) {
            if (!(key in newItems)) {
                const itemInd = trackedFile.items[key];
                this.unTrackItem(itemInd);
                console.debug("null item:" + itemInd);
                removed += 1;
            }
        }
        trackedFile.items = newItems;
        // this.save();     // will be used when plugin.sync_Algo(), which shouldn't

        if (notice) {
            new Notice("Added " + added + " new items, removed " + removed + " items.");
        }
        return { added, removed };
    }

    updateCardItems(
        trackedFile: TrackedFile,
        cardinfo: CardInfo,
        count: number,
        deckName: string = this.defaultDackName,
        notice?: boolean,
    ): { added: number; removed: number } | null {
        if (notice == null) notice = false;
        const len = cardinfo.itemIds.length;
        for (const id of cardinfo.itemIds) {
            const item = this.getItembyID(id);
            item.updateDeckName(deckName, true);
        }
        if (len === count) {
            return;
        }

        const ind = this.getFileIndex(trackedFile.path);
        let added = 0;
        let removed = 0;

        const newitemIds: number[] = cardinfo.itemIds.slice();

        //delete extra items data
        if (count < len) {
            const rmvIds = newitemIds.slice(count);
            rmvIds.forEach((id) => {
                this.unTrackItem(id);
                removed++;
            });
            newitemIds.splice(count, len - count);
            console.debug("delete %d ids:", removed, rmvIds);
            // len = newitemIds.length;
        } else {
            // count > len
            // add new card data
            for (let i = 0; i < count - len; i++) {
                const cardId = this._updateItem(undefined, ind, RPITEMTYPE.CARD, deckName);
                newitemIds.push(cardId);
                added += 1;
            }
            // console.debug("add %d ids:", added, newitemIds);
        }

        newitemIds.sort((a: number, b: number) => a - b);
        cardinfo.itemIds = newitemIds;
        // this.save();

        // console.log(
        //     trackedFile.path +
        //         " update - lineNo:" +
        //         cardinfo.lineNo +
        //         "\n Added: " +
        //         added +
        //         " new card items, removed " +
        //         removed +
        //         " card items.",
        // );
        if (notice) {
            new Notice(
                trackedFile.path +
                    " update - lineNo:" +
                    cardinfo.lineNo +
                    "\n Added: " +
                    added +
                    " new card items, removed " +
                    removed +
                    " card items.",
            );
        }
        return { added, removed };
    }

    async verifyItems() {
        const items = this.data.items;
        await Promise.all(
            items.map(async (item, _idx) => {
                if (item != null && item.isTracked) {
                    // console.debug("verifyItems:", item, id);
                    const itemType = !this.isCardItem(item.ID) ? RPITEMTYPE.NOTE : RPITEMTYPE.CARD;
                    this._updateItem(item.ID, item.fileIndex, itemType, item.deckName);
                }
            }),
        );
        new Notice("all items have been updated.");
    }

    updateReviewedCounts(id: number, type: RPITEMTYPE = RPITEMTYPE.NOTE) {
        let rc = this.data.reviewedCounts;
        if (type === RPITEMTYPE.NOTE) {
            rc = this.data.reviewedCounts;
        } else {
            rc = this.data.reviewedCardCounts;
        }
        // const date = new Date().toLocaleDateString();
        const date = window.moment(new Date()).format("YYYY-MM-DD");
        if (!(date in rc)) {
            rc[date] = { due: 0, new: 0 };
        }
        const item = this.getItembyID(id);
        if (item.isDue) {
            if (this.settings.algorithm === algorithmNames.Fsrs) {
                const data: FsrsData = item.data as FsrsData;
                if (data.last_review < new Date(date)) {
                    rc[date].due++;
                }
            } else {
                const data: AnkiData = item.data as AnkiData;
                if (data.lastInterval >= 1) {
                    rc[date].due++;
                }
            }
        } else {
            rc[date].new++;
            console.debug("new:", rc[date].new);
        }
    }

    findMovedFile(trackedFile: TrackedFile): boolean {
        let exists = false;
        const pathArr = trackedFile.path.split("/");
        const name = pathArr.last().replace(".md", "");
        const notes: TFile[] = app.vault.getMarkdownFiles();
        const result: string[] = [];
        notes.some((note: TFile) => {
            if (note.basename.includes(name) || name.includes(note.basename)) {
                result.push(note.path);
            }
        });
        if (result.length > 0) {
            exists = true;
            console.debug("find file: %s has been moved. %d", trackedFile.path, result.length);
            trackedFile.rename(result[0]);
        }
        return exists;
    }

    /**
     * Verify that the file of this item still exists.
     *
     * @param {string}path
     */
    async verify(path: string): Promise<boolean> {
        const adapter = app.vault.adapter;
        if (path != null) {
            return await adapter.exists(path).catch((_reason) => {
                console.error("Unable to verify file: ", path);
                return false;
            });
        }
        return false;
    }

    /**
     * resetData.
     */
    resetData() {
        this.data = Object.assign({}, DEFAULT_SRS_DATA);
    }

    /**
     * pruneData: delete unused storedata, fsrs's optimizer/writeRevlog() will be affected if using this func.
     * NulltFiles/NullItems
     * @returns
     */
    async pruneData() {
        const items = this.data.items;
        const tracked_files = this.data.trackedFiles;
        let removedNulltFiles = 0;
        let removedNullItems = 0;
        const nullFileList: number[] = [];
        const nullFileList_del: number[] = [];
        const nullItemList: number[] = [];
        const nullItemList_del: number[] = [];

        // if (this.settings.algorithm === "Fsrs") {
        //     new Notice("因涉及到revlog.csv, 暂不可精简清除无效数据");
        //     return;
        //     //用 固定 id
        // }
        tracked_files.map((tf, ind) => {
            if (tf == null) {
                nullFileList.push(ind);
                nullFileList_del.push(ind - nullFileList_del.length);
                removedNulltFiles++;
            }
        });
        for (let i = 0; i < nullFileList_del.length; i++) {
            tracked_files.splice(nullFileList_del[i], 1);
        }
        const nflMin = Math.min(...nullFileList);
        items.map((item, id) => {
            if (item != null && item.fileIndex >= nflMin) {
                const ifind = item.fileIndex;
                for (let nli = nullFileList.length - 1; nli >= 0; nli--) {
                    if (ifind > nullFileList[nli]) {
                        item.fileIndex -= nli + 1;
                        break;
                    } else if (ifind === nullFileList[nli]) {
                        item = null;
                        console.debug("pruneData: item null: " + ifind);
                        break;
                    }
                }
            }
            if (item == null) {
                nullItemList.push(id);
                nullItemList_del.push(id - nullItemList_del.length);
                removedNullItems++;
            }
        });

        for (let i = 0; i < nullItemList_del.length; i++) {
            items.splice(nullItemList_del[i], 1);
        }

        // const nlMin = Math.min(...nullItemList);
        // for (const trackedFile of tracked_files) {
        //     if (trackedFile == null) continue;
        //     const oldId = trackedFile.noteId;
        //     let newId = -1;
        //     if (oldId >= nlMin) {
        //         for (let nli = nullItemList.length - 1; nli >= 0; nli--) {
        //             if (oldId >= nullItemList[nli]) {
        //                 newId = oldId > nullItemList[nli] ? oldId - (nli + 1) : -1;
        //                 trackedFile.items.file = newId;
        //                 this.getItembyID(newId).ID = newId;
        //                 // console.debug("change file: id%d to id%d", oldId, newId, trackedFile);
        //                 break;
        //             }
        //         }
        //     }

        //     // loop itemIds, if has some id point to null, change it.
        //     if (!Object.prototype.hasOwnProperty.call(trackedFile, "cardItems")) {
        //         continue;
        //     }
        //     for (const carditem of trackedFile.cardItems) {
        //         if (Math.max(...carditem.itemIds) >= nlMin) {
        //             for (let idi = 0; idi < carditem.itemIds.length; idi++) {
        //                 const oldId = carditem.itemIds[idi];
        //                 let newId = -1;
        //                 if (oldId >= nlMin) {
        //                     nlfor: for (let nli = nullItemList.length - 1; nli >= 0; nli--) {
        //                         if (oldId >= nullItemList[nli]) {
        //                             newId = oldId > nullItemList[nli] ? oldId - (nli + 1) : newId;
        //                             carditem.itemIds.splice(idi, 1, newId);
        //                             this.getItembyID(newId).ID = newId;
        //                             break nlfor;
        //                         }
        //                     }
        //                 }
        //             }
        //             console.debug("changed card:%s by %s", carditem.itemIds, nullFileList);
        //         }
        //     }
        // }

        // console.debug("after delete nullitems:", items);
        this.data.queues.clearQueue();
        this.save();

        console.log(
            "removed " +
                removedNulltFiles +
                " nullTrackedfile(s), removed " +
                removedNullItems +
                " nullitem(s).",
        );
        return;
    }

    /**
     * @description: getSchedbyId , give returns to scheduling
     * @param {number} id
     * @return {[]}  ["due-interval-ease00", dueString, interval, ease] | null for new
     */
    getSchedbyId(id: number, isNumDue?: boolean): RegExpMatchArray {
        const item: RepetitionItem = this.getItembyID(id);
        return item.getSched(this.settings.algorithm === algorithmNames.Fsrs, isNumDue);
    }

    /**
     * setSchedbyId: set sched into items
     * @param id
     * @param sched RegExpMatchArray
     * @param correct user response
     * @returns
     */
    setSchedbyId(id: number, sched: RegExpMatchArray | number[] | string[], correct?: boolean) {
        const item: RepetitionItem = this.getItembyID(id);
        if (item == null) {
            console.warn("setSchedbyId failed: item === null");
            // this.updateItemById(id);     //not work well yet.
            return;
        }
        sched[0] = id;
        // console.debug("setSchedbyId:", sched);
        item.updateSched(sched, correct);
    }

    /**
     * getFileLast Tag
     * @param path
     * @returns tf.tags.last()
     */
    getFileLasTag(path: string) {
        const tf = this.getTrackedFile(path);
        return tf?.lastTag ?? null;
    }
}
