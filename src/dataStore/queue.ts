import { isArray } from "src/util/utils_recall";
import { DataStore } from "./data";
import { RepetitionItem } from "./repetitionItem";
import { TrackedFile } from "./trackedFile";

interface IQueue {
    /**
     * @type {number[]}
     */
    queue: number[];
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
export class Queue implements IQueue {
    static instance: Queue;
    /**
     * @type {number[]}
     */
    queue: number[];
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

    items: RepetitionItem[];
    maxNewPerDay: number;
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
        this.items = [];
        this.queue = [];
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
    queueSize(): number {
        return this.queue.length;
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
    getNextId(): number | null {
        if (this.queueSize() > 0) {
            return this.queue[0];
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
        const maxNew = this.maxNewPerDay;
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
            this.items.map(async (item, _idx) => {
                if (item != null && item.isTracked) {
                    const file = store.getFileByIndex(item.fileIndex);
                    if (file?.path == undefined) return;
                    let exists = await store.verify(file.path);
                    if (!exists) {
                        // in case file moved away.
                        exists = store.findMovedFile(file);
                    }
                    if (!exists) {
                        console.debug("untrackfile by buildqueue:", file);
                        bUnTfiles.add(file);
                        // new Notice("untrackfile by buildqueue:" + file);
                        // removedItems += this.untrackFile(file.path, false);
                        item.setUntracked();
                        removedItems += 1;
                        untrackedFiles += 1;
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
                            this.remove(item.ID, this.cardRepeatQueue);
                            oldAdd_card += this.push(this.cardQueue, item.ID);
                        }
                    } else {
                        // note Queue
                        if (item.isNew) {
                            // This is a new item.
                            if (
                                !this.isQueued(this.queue, item.ID) &&
                                (maxNew == -1 || newAdd < maxNew)
                            ) {
                                // data.newAdded += 1;
                                this.queue.push(item.ID);
                                newAdd += 1;
                            }
                        } else if (item.nextReview <= now.getTime()) {
                            this.remove(item.ID, this.repeatQueue);
                            oldAdd += this.push(this.queue, item.ID);
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
        this.queue = [];
        const items = DataStore.getInstance().data.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i] != null || items[i].isTracked) {
                this.queue.push(i);
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
            this.queue = [];
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
     * @param {number} item
     * @returns {boolean}
     */
    isQueued(queue: number[], item: number): boolean {
        return queue.includes(item);
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

    remove(id: number, queue?: number[]) {
        if (queue == undefined) {
            this.remove(id, this.queue);
            this.remove(id, this.repeatQueue);

            if (this.toDayLatterQueue[id] !== null) {
                delete this.toDayLatterQueue[id];
            }
        } else {
            if (this.isQueued(queue, id)) {
                queue.remove(id);
            }
        }
    }
    push(queue: number[], id: number) {
        let cnt = 0;
        if (!this.isQueued(queue, id)) {
            queue.push(id);
            cnt++;
        }
        return cnt;
    }
}
