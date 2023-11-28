import { Notice, TFile } from "obsidian";
import { DataStore } from "src/dataStore/data";
import { DataSyncer } from "src/dataStore/dataSyncer";
import { reviewResponseModal } from "src/gui/reviewresponse-modal";
import { t } from "src/lang/helpers";
import { ReviewDeck } from "src/ReviewDeck";
import { SRSettings } from "src/settings";
import { Tags } from "src/tags";
import { DateUtils } from "src/util/utils_recall";

export class ReviewNote {
    static itemId: number;
    static minNextView: number;

    /**
     * after checking ignored folder, get note deckname from review tag and trackedfile.
     * @param settings SRSettings
     * @param note TFile
     * @returns string | null
     */
    static getDeckName(settings: SRSettings, note: TFile): string | null {
        const store = DataStore.getInstance();
        // const settings = plugin.data.settings;

        if (isIgnoredPath(settings.noteFoldersToIgnore, note.path)) {
            new Notice(t("NOTE_IN_IGNORED_FOLDER"));
            return;
        }

        let deckName = Tags.getNoteDeckName(note, settings);

        if (deckName == null && !store.isTracked(note.path)) {
            new Notice(t("PLEASE_TAG_NOTE"));
            return;
        } else if (deckName == null) {
            deckName = store.getFileLasTag(note.path);
        }
        return deckName;
    }

    static saveReviewResponsebyAlgo(
        deck: ReviewDeck,
        note: TFile,
        option: string,
        burySiblingCards: boolean,
        ease?: number,
    ) {
        const store = DataStore.getInstance();
        const now = Date.now();

        const fileId = store.getFileId(note.path);
        const item = store.getItembyID(fileId);
        if (item.isNew && ease != null) {
            // new note
            item.updateAlgorithmData("ease", ease);
        }
        const buryList: string[] = [];
        if (burySiblingCards) {
            const trackFile = store.getTrackedFile(note.path);
            if (trackFile.hasCards) {
                for (const cardinfo of trackFile.cardItems) {
                    buryList.push(cardinfo.cardTextHash);
                }
            }
        }

        ReviewNote.recallReviewResponse(fileId, option);

        let dueNotesCount = 0;
        dueNotesCount -= preUpdateDeck(deck, note);
        dueNotesCount += DataSyncer.syncRCDataToSRrevDeck(deck, note, now);
        return { buryList, dueNotesCount };
    }

    static recallReviewNote(settings: SRSettings) {
        // const plugin = this.plugin;
        const store = DataStore.getInstance();
        const reviewFloatBar = reviewResponseModal.getInstance();
        // const settings = plugin.data.settings;
        const que = store.data.queues;
        que.buildQueue();
        const item = store.getNext();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state: any = { mode: "empty" };
        if (item != null) {
            this.itemId = item.ID;
            console.debug("item:", item, que.queueSize());
            const path = store.getFilePath(item);
            if (path != null) {
                state.file = path;
                state.item = que.getNextId();
                // state.mode = "note";
                // state.mode = "question";
                // const fid = store.getFileId(path);
                // const item = store.getItembyID(fid);

                reviewFloatBar.algoDisplay(true, item, (opt) => {
                    this.recallReviewResponse(this.itemId, opt, settings.autoNextNote);
                    if (settings.autoNextNote) {
                        this.recallReviewNote(settings);
                    }
                });
                // plugin.reviewFloatBar.algoDisplay(true, store.calcReviewInterval(fid));
            }
        }
        const leaf = app.workspace.getLeaf();
        leaf.setViewState({
            type: "markdown",
            state: state,
        });

        app.workspace.setActiveLeaf(leaf);

        if (item != null) {
            return;
        }

        this.nextReviewNotice(store.data.queues.toDayLatterQueue);

        // plugin.updateStatusBar();

        reviewFloatBar.selfDestruct();
        // plugin.sync_Algo();
        new Notice(t("ALL_CAUGHT_UP"));
    }

    static recallReviewResponse(itemId: number, response: string, autoNextNote: boolean = true) {
        const store = DataStore.getInstance();
        const item = store.getItembyID(itemId);
        // console.debug("itemId: ", itemId);
        store.updateReviewedCounts(itemId);
        store.reviewId(itemId, response);
        store.save();

        this.minNextView = this.updateminNextView(this.minNextView, item.nextReview);

        if (!autoNextNote) {
            new Notice(t("RESPONSE_RECEIVED"));
        }
    }

    static getDeckNameForReviewDirectly(reviewDecks: {
        [deckKey: string]: ReviewDeck;
    }): string | null {
        const reviewDeckNames: string[] = Object.keys(reviewDecks);

        const rdname = reviewDeckNames.find((dkey: string) => {
            const ndeck = reviewDecks[dkey];
            const ncount = ndeck.dueNotesCount + ndeck.newNotes.length;
            return ncount > 0;
        });
        return rdname;
    }

    static getNextDueNoteIndex(NotesCount: number, openRandomNote: boolean = false) {
        let index = -1;

        if (NotesCount < 1) {
            return -1;
        }
        if (!openRandomNote) {
            return 0;
        } else {
            index = Math.floor(Math.random() * NotesCount);
        }
        return index;
    }

    static updateminNextView(minNextView: number, nextReview: number): number {
        const now = Date.now();
        const nowToday: number = window.moment().endOf("day").valueOf();

        if (nextReview <= nowToday) {
            if (minNextView == undefined || minNextView < now || minNextView > nextReview) {
                // console.debug("interval diff:should be - (", minNextView - nextReview);
                minNextView = nextReview;
            }
        }
        return minNextView;
    }

    static nextReviewNotice(toDayLatterQueue: Record<number, string>) {
        if (this.minNextView > 0 && Object.keys(toDayLatterQueue).length > 0) {
            const now = Date.now();
            const interval = Math.round((this.minNextView - now) / 1000 / 60);
            if (interval < 60) {
                new Notice("可以在" + interval + "分钟后来复习");
            } else if (interval < 60 * 5) {
                new Notice("可以在" + interval / 60 + "小时后来复习");
            }
        }
    }
}

export function isIgnoredPath(noteFoldersToIgnore: string[], path: string) {
    if (noteFoldersToIgnore.some((folder) => path.includes(folder))) {
        return true;
    } else {
        return false;
    }
}

function preUpdateDeck(deck: ReviewDeck, note: TFile) {
    let dueNotesCount = 0;
    if (deck.newNotes.includes(note)) {
        // isNew
        deck.newNotes.remove(note);
    } else {
        //isDued
        const index = deck.scheduledNotes.findIndex((sNote, _index) => {
            return sNote.note === note;
        });
        deck.scheduledNotes.splice(index, 1);
        if (index < deck.dueNotesCount) {
            deck.dueNotesCount--;
            dueNotesCount--;
        }
    }
    return dueNotesCount;
}

export function updatenDays(dueDates: Record<number, number>, dueUnix: number) {
    const nDays: number = Math.ceil((dueUnix - DateUtils.EndofToday) / DateUtils.DAYS_TO_MILLIS);
    if (!Object.prototype.hasOwnProperty.call(dueDates, nDays)) {
        dueDates[nDays] = 0;
    }
    dueDates[nDays]++;
}
