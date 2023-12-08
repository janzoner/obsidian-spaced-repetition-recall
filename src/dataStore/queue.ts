import { isArray } from "src/util/utils_recall";
import { DataStore } from "./data";
import { TrackedFile } from "./trackedFile";
import { RepetitionItem } from "./repetitionItem";

export interface IQueue {
    /**
     * @type {number[]}
     */
    queue: Record<string, number[]>;
    /**
     * @type {number[]}
     */
    repeatQueue: number[];
    /**
     * @type {number[]}
     */
    cardQueue: number[];
    /**
     * @type {number[]}
     */
    cardRepeatQueue: number[];
    toDayAllQueue: Record<number, string>;
    toDayLatterQueue: Record<number, string>;

    /**
     * @type {number}
     */
    lastQueue: number;
    /**
     * @type {0}
     */
    newAdded: 0;
}

export const DEFAULT_QUEUE_DATA: IQueue = {
    /**
     * @type {number[]}
     */
    queue: {},
    /**
     * @type {number[]}
     */
    repeatQueue: [],
    /**
     * @type {number[]}
     */
    cardQueue: [],
    /**
     * @type {number[]}
     */
    cardRepeatQueue: [],
    toDayAllQueue: {},
    toDayLatterQueue: {},
    /**
     * @type {number}
     */
    lastQueue: 0,
    /**
     * @type {0}
     */
    newAdded: 0,
};

export class Queue implements IQueue {
    static instance: Queue;
    /**
     * @type {number[]}
     */
    queue: Record<string, number[]>;
    /**
     * @type {number[]}
     */
    repeatQueue: number[];
    /**
     * @type {number[]}
     */
    cardQueue: number[];
    /**
     * @type {number[]}
     */
    cardRepeatQueue: number[];
    toDayAllQueue: Record<number, string>;
    toDayLatterQueue: Record<number, string>;

    // maxNewPerDay: number;
    lastQueue: number;
    /**
     * @type {0}
     */
    newAdded: 0;

    public static getInstance(): Queue {
        if (!Queue.instance) {
            // Queue.instance = new Queue();
            throw Error("there is not Queue instance.");
        }
        return Queue.instance;
    }

    static create(que: Queue) {
        que = Object.assign(new Queue(), que);
        return que;
    }
    constructor() {
        this.queue = {};
        this.repeatQueue = [];
        this.cardQueue = [];
        this.cardRepeatQueue = [];
        this.toDayAllQueue = {};
        this.toDayLatterQueue = {};
        Queue.instance = this;
    }

    /**
     * Returns the size of the current queue.
     */
    /**
     * queueSize.
     *
     * @returns {number}
     */
    queueSize(key?: string): number {
        if (key == undefined) {
            key = DataStore.getInstance().defaultDackName;
        }
        return this.queue[key]?.length ?? 0;
    }
    /**
     * repeatQueueSize.
     *
     * @returns {number}
     */
    repeatQueueSize(): number {
        return this.repeatQueue.length;
    }
    /**
     * getNextId.
     *
     * @returns {number | null}
     */
    getNextId(key?: string): number | null {
        if (this.queueSize(key) > 0) {
            return this.queue[key][0];
        } else if (this.repeatQueue.length > 0) {
            return this.repeatQueue[0];
        } else {
            return null;
        }
    }

    /**
     * buildQueue. indexlist of items
     */
    async buildQueue() {
        // console.log("Building queue...");
        const store = DataStore.getInstance();
        const maxNew = store.settings.maxNewPerDay;
        const now: Date = new Date();

        if (now.getDate() != new Date(this.lastQueue).getDate()) {
            this.newAdded = 0;
            // this.clearQueue();
        }

        let oldAdd = 0;
        let newAdd = 0;
        let oldAdd_card = 0;
        let newAdd_card = 0;

        let untrackedFiles = 0;
        let removedItems = 0;
        const bUnTfiles = new Set<TrackedFile>();
        await Promise.all(
            store.items.map(async (item, _idx) => {
                if (item != null && item.isTracked) {
                    const file = store.getFileByIndex(item.fileIndex);
                    if (file?.path == undefined) return;
                    let exists = await store.verify(file.path);
                    if (!exists) {
                        // in case file moved away.
                        exists = store.findMovedFile(file);
                    }
                    if (!exists) {
                        if (!bUnTfiles.has(file)) {
                            console.debug("untrackfile by buildqueue:", file);
                            bUnTfiles.add(file);
                            untrackedFiles += 1;
                            // new Notice("untrackfile by buildqueue:" + file);
                        }
                        // removedItems += this.untrackFile(file.path, false);
                        item.setUntracked();
                        removedItems += 1;
                    } else if (file.noteId !== item.ID) {
                        // card Queue
                        if (item.isNew) {
                            // This is a new item.
                            if (maxNew == -1 || this.newAdded < maxNew) {
                                this.newAdded += 1;
                                this.cardQueue.push(item.ID);
                                newAdd_card += 1;
                            }
                        } else if (item.nextReview <= now.getTime()) {
                            this.remove(item, this.cardRepeatQueue);
                            oldAdd_card += this.push(this.cardQueue, item.ID);
                        }
                    } else {
                        // note Queue
                        if (this.queueSize(item.deckName) === 0) {
                            this.queue[item.deckName] = [];
                        }
                        if (item.isNew) {
                            // This is a new item.
                            if (maxNew == -1 || newAdd < maxNew) {
                                // data.newAdded += 1;
                                newAdd += this.push(this.queue[item.deckName], item.ID);
                            }
                        } else if (item.nextReview <= now.getTime()) {
                            this.remove(item, this.repeatQueue);
                            oldAdd += this.push(this.queue[item.deckName], item.ID);
                        }
                    }
                }
            }),
        );

        this.lastQueue = now.getTime();
        // if (this.settings.shuffleQueue && oldAdd + newAdd > 0) {
        //     MiscUtils.shuffle(data.queue);
        // }

        // console.log(
        //     "Added " + (oldAdd + newAdd) + " notes to review queue, with " + newAdd + " new!",
        // );
        // console.log(
        //     "Added " +
        //         (oldAdd_card + newAdd_card) +
        //         " cards to review queue, with " +
        //         newAdd_card +
        //         " new!",
        // );

        if (untrackedFiles > 0) {
            console.log(
                "Recall: Untracked " +
                    bUnTfiles.size +
                    " files with a total of " +
                    removedItems +
                    " items while building queue!\n",
                bUnTfiles,
            );
        }
    }

    buildQueueAll() {
        const store = DataStore.getInstance();
        this.queue[store.defaultDackName] = [];
        const items = store.data.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i] != null || items[i].isTracked) {
                this.queue[store.defaultDackName].push(i);
            }
        }
    }

    // loadRepeatQueue(rvdecks: { [deckKey: string]: ReviewDeck }) {
    //     if (this.repeatQueueSize() > 0) {
    //         // const repeatDeckCounts: Record<string, number> = {};
    //         this.repeatQueue.forEach((id) => {
    //             const dname: string = this.getItembyID(id).deckName;
    //             // this.toDayAllQueue[id] = dname;
    //             // if (!Object.keys(repeatDeckCounts).includes(dname)) {
    //             //     repeatDeckCounts[dname] = 0;
    //             // }
    //             rvdecks[dname].dueNotesCount++;
    //             this.plugin.dueNotesCount++;
    //         });
    //         // return repeatDeckCounts;
    //     }
    // }

    clearQueue(queue: unknown = null) {
        if (queue == null) {
            this.queue = {};
            this.repeatQueue = [];
            this.cardQueue = [];
            this.cardRepeatQueue = [];
            this.toDayAllQueue = {};
            this.toDayLatterQueue = {};
            console.debug("all queue are cleared!");
        } else if (isArray(queue)) {
            queue = [];
        } else {
            queue = {};
        }
    }

    /**
     * isQueued.
     *
     * @param {number} id
     * @returns {boolean}
     */
    isQueued(queue: number[], id: number): boolean {
        return queue?.includes(id) ?? false;
    }

    /**
     * isInRepeatQueue.
     *
     * @param {number} item
     * @returns {boolean}
     */
    isInRepeatQueue(item: number): boolean {
        return this.repeatQueue.includes(item) || this.cardRepeatQueue.includes(item);
    }

    updateWhenReview(item: RepetitionItem, correct: boolean, repeatItems: boolean) {
        if (this.isInRepeatQueue(item.ID)) {
            this.remove(item, this.repeatQueue);
        } else {
            this.remove(item, this.queue[item.deckName]);
        }
        if (repeatItems && !correct) {
            this.push(this.repeatQueue, item.ID); // Re-add until correct.
        }
    }

    remove(item: RepetitionItem, queue?: number[]) {
        if (queue == undefined) {
            if (this.isQueued(this.queue[item.deckName], item.ID)) {
                this.remove(item, this.queue[item.deckName]);
                this.remove(item, this.repeatQueue);
            }

            if (this.toDayLatterQueue[item.ID] !== null) {
                delete this.toDayLatterQueue[item.ID];
            }
        } else {
            if (this.isQueued(queue, item.ID)) {
                queue.remove(item.ID);
            }
        }
    }
    push(queue: number[], id: number) {
        let cnt = 0;
        if (this.isQueued(queue, id)) {
            return cnt;
        }
        queue.push(id);
        cnt++;
        return cnt;
    }
}
