import { AnkiData } from "src/algorithms/anki";
import { FsrsData } from "src/algorithms/fsrs";
import { ReviewResult } from "./data";
import { DateUtils } from "src/util/utils_recall";

export enum RPITEMTYPE {
    NOTE = "note",
    CARD = "card",
}

/**
 * RepetitionItem.
 */
export class RepetitionItem {
    /**
     * @type {number}
     */
    nextReview: number;
    /**
     * @type {number}
     */
    ID: number;
    /**
     * @type {number}
     */
    fileIndex: number;
    /**
     * @type {RPITEMTYPE}
     */
    itemType: RPITEMTYPE;
    /**
     * @type {string}
     */
    deckName: string;
    /**
     * @type {number}
     */
    timesReviewed: number;
    /**
     * @type {number}
     */
    timesCorrect: number;
    /**
     * @type {number}
     */
    errorStreak: number; // Needed to calculate leeches later on.
    /**
     * @type {any}
     */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: unknown; // Additional data, determined by the selected algorithm.

    static create(item: RepetitionItem) {
        const newItem = new RepetitionItem();
        Object.assign(newItem, item);
        return newItem;
    }

    constructor(
        id: number = -1,
        fileIndex: number = -1,
        itemType: RPITEMTYPE = RPITEMTYPE.NOTE,
        deckName: string = "default",
        data: unknown = {},
    ) {
        this.nextReview = 0;
        this.ID = id;
        this.fileIndex = fileIndex;
        this.itemType = itemType;
        this.deckName = deckName;
        this.timesReviewed = 0;
        this.timesCorrect = 0;
        this.errorStreak = 0;
        this.data = data;
    }

    /**
     * @param {ReviewResult} result
     * @return {*}
     */
    reviewUpdate(result: ReviewResult) {
        this.nextReview = DateUtils.fromNow(result.nextReview).getTime();
        this.timesReviewed += 1;
        if (result.correct) {
            this.timesCorrect += 1;
            this.errorStreak = 0;
        } else {
            this.errorStreak += 1;
        }
    }

    /**
     *
     * @param isFsrs
     * @param isNumDue  default is true.
     * @returns
     */
    getSched(isFsrs?: boolean, isNumDue = true): RegExpMatchArray | null {
        if (this.nextReview === 0 || this.nextReview === null || this.timesReviewed === 0) {
            return null; // new card doesn't need schedinfo
        }

        let ease: number;
        let interval: number;
        if (isFsrs == undefined) {
            if (Object.prototype.hasOwnProperty.call(this.data, "state")) {
                isFsrs = true;
            } else {
                isFsrs = false;
            }
        }
        if (!isFsrs) {
            const data: AnkiData = this.data as AnkiData;
            ease = data.ease;
            interval = data.lastInterval;
            // const interval = this.data.iteration;
        } else {
            const data = this.data as FsrsData;
            interval = data.scheduled_days;
            // ease just used for StatsChart, not review scheduling.
            ease = data.state;
        }

        const sched = [this.ID, this.nextReview, interval, ease] as unknown as RegExpMatchArray;
        if (!isNumDue) {
            const due = window.moment(this.nextReview);
            sched[1] = due.format("YYYY-MM-DD");
        }
        return sched;
    }

    updateSched(sched: RegExpMatchArray | number[] | string[], correct?: boolean) {
        const data: AnkiData = this.data as AnkiData;

        this.nextReview =
            typeof sched[1] == "number"
                ? Number(sched[1])
                : window
                      .moment(sched[1], ["YYYY-MM-DD", "DD-MM-YYYY", "ddd MMM DD YYYY"])
                      .valueOf();
        data.lastInterval = Number(sched[2]);
        data.ease = Number(sched[3]);

        if (correct != null) {
            this.timesReviewed += 1;
            if (correct) {
                this.timesCorrect += 1;
                this.errorStreak = 0;
            } else {
                this.errorStreak += 1;
            }
        }
    }

    /**
     * check if file id is just new add.
     * @returns boolean
     */
    get isNew(): boolean {
        try {
            if (this.nextReview > 0) {
                return false;
            } else if (this.nextReview === 0 || this.timesReviewed === 0) {
                // This is a new item.
                return true;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    get isDue() {
        try {
            if (this.nextReview > 0 || this.timesReviewed > 0) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    get isTracked() {
        return this.fileIndex >= 0;
    }

    setTracked(fileIndex: number) {
        this.fileIndex = fileIndex;
    }

    setUntracked() {
        this.fileIndex = -1;
    }

    /**
     * updateDeckName, if different, uupdate. Else do none thing.
     * @param deckName
     * @param isCard
     */
    updateDeckName(deckName: string, isCard: boolean) {
        if (this.deckName !== deckName) {
            this.deckName = deckName;
        }
        if (!Object.prototype.hasOwnProperty.call(this, "itemType")) {
            this.itemType = isCard ? RPITEMTYPE.CARD : RPITEMTYPE.NOTE;
        }
    }

    /**
     * updateItem AlgorithmData.
     * @param id
     * @param key
     * @param value
     */
    updateAlgorithmData(key: string, value: unknown) {
        try {
            if (value == null) {
                throw new Error("updateAlgorithmData get null value: " + value);
            }
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            this.data[key] = value;
        } catch (error) {
            console.log(error);
        }
    }
}
