import { TFile } from "obsidian";
import { CardScheduleInfo, NoteCardScheduleParser } from "src/CardSchedule";
import { Note } from "src/Note";
import { ReviewDeck } from "src/ReviewDeck";
import { SrTFile } from "src/SRFile";
import { TopicPath } from "src/TopicPath";
import { DataStore, RPITEMTYPE } from "src/dataStore/data";
import { Stats } from "src/stats";
import { getKeysPreserveType } from "src/util/utils";
import { BlockUtils, DateUtils } from "src/util/utils_recall";
import { CardInfo, TrackedFile } from "./trackedFile";
import { Card } from "src/Card";

export class DataSyncer {
    // store: DataStore;

    // constructor() {
    //     this.store = DataStore.getInstance();
    // }

    /**
     * sync RCsrsDataTo SRreviewDecks
     *
     * @param rdeck
     * @returns
     */
    static syncRCsrsDataToSRreviewDecks(
        reviewDecks: { [deckKey: string]: ReviewDeck },
        deckName: string,
        noteStats: Stats,
    ) {
        const store = DataStore.getInstance();
        // const store = plugin.store;
        store.data.queues.buildQueue();
        const now = new Date().getTime();
        const queue = store.data.queues.queue;
        let dueCount: number = 0;
        // for (let i = 0; i < queue.length; i++) {
        for (const trackedFile of store.data.trackedFiles) {
            if (trackedFile == null || trackedFile.noteId < 0) {
                continue;
            }
            const id = trackedFile.noteId;
            // const id = queue[i];
            const item = store.getItembyID(id);
            if (item == null || !item.isTracked) {
                console.log("syncRCsrsDataToSRreviewDecks: null item", id);
                continue;
            }

            const note = app.vault.getAbstractFileByPath(trackedFile.path) as TFile;
            if (!note) {
                console.log("Could not find file: ", trackedFile.path);
                continue;
            }

            if (trackedFile.tags?.last() === store.defaultDackName) {
                // only add default deck.
                noteStats.updateStats(item);
                const result = DataSyncer.syncRCDataToSRrevDeck(reviewDecks[deckName], note);
                dueCount += result;
            }
        }
        return dueCount;
    }

    /**
     * syncRCDataToSR ReviewDeck ,
     * and update deckName to trackedfile.tags;
     * @param rdeck
     * @returns
     */
    static syncRCDataToSRrevDeck(rdeck: ReviewDeck, note: TFile, now?: number) {
        // const plugin = plugin;
        // const rdeck = reviewDecks[deckName];
        const store = DataStore.getInstance();
        const ind = store.getFileIndex(note.path);
        const trackedFile = store.getTrackedFile(note.path);
        const fileid = store.getFileId(note.path);
        let item = store.getItembyID(fileid);
        let now_number: number = now;
        const nowToday: number = DateUtils.EndofToday;

        if (item == null || !item.isTracked) {
            store._updateItem(fileid, ind, RPITEMTYPE.NOTE, rdeck.deckName);
            item = store.getItembyID(fileid);
            console.debug("syncRCDataToSRrevDeck update null item:", item, trackedFile);
            // return;
        }
        if (now == null) {
            now_number = nowToday;
        } else {
            delete store.data.queues.toDayLatterQueue[fileid];

            getKeysPreserveType(store.data.queues.toDayLatterQueue).forEach((idStr, _idx, _arr) => {
                const id: number = Number(idStr);
                const item = store.getItembyID(id);
                if (now - item.nextReview > 0) {
                    // const dname = item.deckName;
                    // reviewDecks[dname].dueNotesCount++;
                    delete store.data.queues.toDayLatterQueue[id];
                }
            });

            if (item.nextReview <= nowToday) {
                store.data.queues.toDayLatterQueue[fileid] = rdeck.deckName;
            }
        }

        let dueNotesCount: number = 0;
        if (item.isDue) {
            rdeck.scheduledNotes.push({ note: note, dueUnix: item.nextReview });
            if (item.nextReview <= now_number) {
                rdeck.dueNotesCount++;
                dueNotesCount = 1;
            }
        } else {
            rdeck.newNotes.push(note);
            // console.debug("syncRCDataToSRrevDeck : addNew", fileid);
        }
        // update store.trackFile and item
        trackedFile.updateTags(rdeck.deckName);
        item.updateDeckName(rdeck.deckName, store.isCardItem(item.ID));

        return dueNotesCount;
    }

    static setTrackfileCardSched(
        trackedFile: TrackedFile,
        deckName: string,
        lineNo: number,
        cardTextHash: string,
        count: number,
        scheduling?: RegExpMatchArray[],
    ): CardInfo {
        if (scheduling == null || scheduling.length == 0) {
            return;
        }

        const store = DataStore.getInstance();
        const carditem = trackedFile.trackCard(lineNo, cardTextHash);

        store.updateCardItems(trackedFile, carditem, count, deckName);
        // from CardSchedule.ts
        const dummyDueDateForNewCard: string = "2000-01-01";
        scheduling.forEach((sched: RegExpMatchArray, index) => {
            if (sched[1] !== dummyDueDateForNewCard) {
                store.setSchedbyId(carditem.itemIds[index], sched, true);
            }
        });
        return carditem;
    }

    static updateCardsSched_algo(note: Note, topicPath: TopicPath) {
        // const settings: SRSettings = plugin.data.settings;

        const store = DataStore.getInstance();
        // const store = plugin.store;
        const file: SrTFile = note.file as SrTFile;
        const trackedFile = store.getTrackedFile(file.path);

        for (const question of note.questionList) {
            const deckname = question.topicPath.hasPath
                ? question.topicPath.path[0]
                : topicPath.path[0];

            const cardText: string = question.questionText.actualQuestion;
            const lineNo: number = question.lineNo;
            const cardTextHash = BlockUtils.getTxtHash(cardText);
            const count: number = question.cards.length;
            const scheduling: RegExpMatchArray[] = [];
            let carditem = trackedFile.getSyncCardInfo(lineNo, cardTextHash);
            if (carditem != null) {
                carditem.itemIds.forEach((id: number) => {
                    const sched = store.getSchedbyId(id);
                    // ignore new add card
                    if (sched != null && scheduling.length <= count) {
                        scheduling.push(sched);
                    }
                });
            } else {
                carditem = trackedFile.trackCard(lineNo, cardTextHash);
            }
            store.updateCardItems(trackedFile, carditem, count, deckname, false);
            updateCardObjs(question.cards, carditem, scheduling);

            // update question
            question.hasChanged = false;
            if (question.topicPath.isEmptyPath && deckname === store.defaultDackName) {
                question.topicPath = new TopicPath([deckname]);
            }
        }

        // update trackfile
        if (note.questionList.length > 0) {
            const tag = topicPath.path[0];
            if (tag !== store.defaultDackName && !tag.startsWith("#")) {
                trackedFile.updateTags("#" + tag);
            }
        }
    }
}

function updateCardObjs(cards: Card[], cardinfo: CardInfo, scheduling: RegExpMatchArray[]) {
    const schedInfoList: CardScheduleInfo[] =
        NoteCardScheduleParser.createInfoList_algo(scheduling);
    const carditemIds = cardinfo.itemIds;
    for (let i = 0; i < cards.length; i++) {
        const cardObj = cards[i];
        const hasScheduleInfo: boolean = i < schedInfoList.length;
        const schedule: CardScheduleInfo = schedInfoList[i];
        cardObj.scheduleInfo =
            hasScheduleInfo && !schedule.isDummyScheduleForNewCard() ? schedule : null;
        cardObj.Id = carditemIds[i];
    }
}
