import { Notice, Plugin, TAbstractFile, TFile, getAllTags, FrontMatterCache } from "obsidian";
import * as graph from "pagerank.js";

import { SRSettingTab, SRSettings, DEFAULT_SETTINGS } from "src/settings";
import { FlashcardModal } from "src/gui/flashcard-modal";
import { StatsModal } from "src/gui/stats-modal";
import { ReviewQueueListView, REVIEW_QUEUE_VIEW_TYPE } from "src/gui/sidebar";
import { ReviewResponse, schedule } from "src/scheduling";
import { YAML_FRONT_MATTER_REGEX, SCHEDULING_INFO_REGEX } from "src/constants";
import { ReviewDeck, ReviewDeckSelectionModal } from "src/ReviewDeck";
import { t } from "src/lang/helpers";
import { appIcon } from "src/icons/appicon";
import { TopicPath } from "./TopicPath";
import { CardListType, Deck, DeckTreeFilter } from "./Deck";
import { Stats } from "./stats";
import {
    FlashcardReviewMode,
    FlashcardReviewSequencer as FlashcardReviewSequencer,
    IFlashcardReviewSequencer as IFlashcardReviewSequencer,
} from "./FlashcardReviewSequencer";
import {
    CardListOrder,
    DeckTreeIterator,
    IDeckTreeIterator,
    IIteratorOrder,
    IteratorDeckSource,
    OrderMethod,
} from "./DeckTreeIterator";
import { CardScheduleCalculator } from "./CardSchedule";
import { Note } from "./Note";
import { NoteFileLoader } from "./NoteFileLoader";
import { ISRFile, SrTFile as SrTFile } from "./SRFile";
import { NoteEaseCalculator } from "./NoteEaseCalculator";
import { DeckTreeStatsCalculator } from "./DeckTreeStatsCalculator";
import { NoteEaseList } from "./NoteEaseList";
import { QuestionPostponementList } from "./QuestionPostponementList";

// https://github.com/martin-jw/obsidian-recall
import { DataStore, RPITEMTYPE } from "./dataStore/data";
import Commands from "./commands";
import SrsAlgorithm from "./algorithms/algorithms";
import { algorithms } from "src/settings";
import { reviewResponseModal } from "src/gui/reviewresponse-modal";
import { DateUtils, isVersionNewerThanOther } from "./util/utils_recall";
import { ReleaseNotes } from "src/gui/ReleaseNotes";

import { algorithmNames } from "src/algorithms/algorithms_switch";
import { DataLocation } from "./dataStore/location_switch";
import { addFileMenuEvt, registerTrackFileEvents } from "./Events/trackFileEvents";
import { ReviewNote, isIgnoredPath } from "src/reviewNote/review-note";
import { Tags } from "./tags";
import { DataSyncer } from "./dataStore/dataSyncer";
import { calcLinkContribution, updategraphLink } from "./algorithms/priorities/linkPageranks";
import { Queue } from "./dataStore/queue";

interface PluginData {
    settings: SRSettings;
    buryDate: string;
    // hashes of card texts
    // should work as long as user doesn't modify card's text
    // which covers most of the cases
    buryList: string[];
    historyDeck: string | null;
}

const DEFAULT_DATA: PluginData = {
    settings: DEFAULT_SETTINGS,
    buryDate: "",
    buryList: [],
    historyDeck: null,
};

export interface SchedNote {
    note: TFile;
    dueUnix: number;
}

export interface LinkStat {
    sourcePath: string;
    linkCount: number;
}

export default class SRPlugin extends Plugin {
    private statusBar: HTMLElement;
    private reviewQueueView: ReviewQueueListView;
    public data: PluginData;
    public syncLock = false;

    public reviewDecks: { [deckKey: string]: ReviewDeck } = {};
    public lastSelectedReviewDeck: string;

    public easeByPath: NoteEaseList;
    private questionPostponementList: QuestionPostponementList;
    public incomingLinks: Record<string, LinkStat[]> = {};
    public pageranks: Record<string, number> = {};
    private dueNotesCount = 0;
    public dueDatesNotes: Record<number, number> = {}; // Record<# of days in future, due count>

    public deckTree: Deck = new Deck("root", null);
    private remainingDeckTree: Deck;
    public cardStats: Stats;
    public noteStats: Stats;

    // https://github.com/martin-jw/obsidian-recall/blob/main/src/main.ts
    public store: DataStore;
    public commands: Commands;
    public algorithm: SrsAlgorithm;
    public reviewFloatBar: reviewResponseModal;
    public settingTab: SRSettingTab;

    async onload(): Promise<void> {
        await this.loadPluginData();
        // const store = this.store;
        this.easeByPath = new NoteEaseList(this.data.settings);
        this.questionPostponementList = new QuestionPostponementList(
            this,
            this.data.settings,
            this.data.buryList,
        );

        appIcon();

        const PLUGIN_VERSION = this.manifest.version;
        const obsidianJustInstalled = this.data.settings.previousRelease === "0.0.0";
        if (isVersionNewerThanOther(PLUGIN_VERSION, this.data.settings.previousRelease)) {
            new ReleaseNotes(this.app, this, obsidianJustInstalled ? null : PLUGIN_VERSION).open();
        }

        const settings = this.data.settings;
        this.algorithm = algorithms[settings.algorithm];
        this.algorithm.updateSettings(this, settings.algorithmSettings[settings.algorithm]);
        settings.algorithmSettings[settings.algorithm] = this.algorithm.settings;
        this.savePluginData();

        this.commands = new Commands(this);
        this.commands.addCommands();
        if (this.data.settings.showDebugMessages) {
            this.commands.addDebugCommands();
        }

        this.reviewFloatBar = new reviewResponseModal(settings, this.algorithm.srsOptions());
        this.reviewFloatBar.submitCallback = (note, resp) => {
            this.saveReviewResponse(note, resp);
        };

        registerTrackFileEvents(this);

        // if (this.data.settings.dataLocation != DataLocation.SaveOnNoteFile) {
        //     this.registerInterval(window.setInterval(() => this.sync(), 5 * 60 * 1000));
        // }

        this.statusBar = this.addStatusBarItem();
        this.statusBar.classList.add("mod-clickable");
        this.statusBar.setAttribute("aria-label", t("OPEN_NOTE_FOR_REVIEW"));
        this.statusBar.setAttribute("aria-label-position", "top");
        this.statusBar.addEventListener("click", async () => {
            if (!this.syncLock) {
                await this.sync();
                this.reviewNextNoteModal();
            }
        });

        this.addRibbonIcon("SpacedRepIcon", t("REVIEW_CARDS"), async () => {
            if (!this.syncLock) {
                await this.sync();
                this.openFlashcardModal(
                    this.deckTree,
                    this.remainingDeckTree,
                    FlashcardReviewMode.Review,
                );
            }
        });

        if (!this.data.settings.disableFileMenuReviewOptions) {
            this.registerEvent(
                this.app.workspace.on("file-menu", (menu, fileish: TAbstractFile) => {
                    if (fileish instanceof TFile && fileish.extension === "md") {
                        const options = this.algorithm.srsOptions();
                        const algo = this.data.settings.algorithm;
                        const showtext = this.data.settings.responseOptionBtnsText;
                        for (let i = 1; i < options.length; i++) {
                            menu.addItem((item) => {
                                // item.setTitle(t("REVIEW_EASY_FILE_MENU"))
                                item.setTitle(showtext[algo][i])
                                    .setIcon("SpacedRepIcon")
                                    .onClick(() => {
                                        this.saveReviewResponse(fileish, i);
                                    });
                            });
                        }
                    }

                    addFileMenuEvt(this, menu, fileish);
                }),
            );
        }

        this.addCommand({
            id: "srs-note-review-open-note",
            name: t("OPEN_NOTE_FOR_REVIEW"),
            callback: async () => {
                if (!this.syncLock) {
                    await this.sync();
                    this.reviewNextNoteModal();
                }
            },
        });

        const options = this.algorithm.srsOptions();
        const algo = this.data.settings.algorithm;
        const showtext = this.data.settings.responseOptionBtnsText;
        options.map((option, i) => {
            this.addCommand({
                id: "srs-note-review-" + option.toLowerCase(),
                name: "review as: " + showtext[algo][i],
                callback: () => {
                    const openFile: TFile | null = this.app.workspace.getActiveFile();
                    if (openFile && openFile.extension === "md") {
                        this.saveReviewResponse(openFile, i);
                    }
                },
            });
        });

        this.addCommand({
            id: "srs-review-flashcards",
            name: t("REVIEW_ALL_CARDS"),
            callback: async () => {
                if (!this.syncLock) {
                    await this.sync();
                    this.openFlashcardModal(
                        this.deckTree,
                        this.remainingDeckTree,
                        FlashcardReviewMode.Review,
                    );
                }
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards",
            name: t("CRAM_ALL_CARDS"),
            callback: async () => {
                await this.sync();
                this.openFlashcardModal(this.deckTree, this.deckTree, FlashcardReviewMode.Cram);
            },
        });

        this.addCommand({
            id: "srs-review-flashcards-in-note",
            name: t("REVIEW_CARDS_IN_NOTE"),
            callback: async () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (openFile && openFile.extension === "md") {
                    this.openFlashcardModalForSingleNote(openFile, FlashcardReviewMode.Review);
                }
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards-in-note",
            name: t("CRAM_CARDS_IN_NOTE"),
            callback: async () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (openFile && openFile.extension === "md") {
                    this.openFlashcardModalForSingleNote(openFile, FlashcardReviewMode.Cram);
                }
            },
        });

        this.addCommand({
            id: "srs-view-stats",
            name: t("VIEW_STATS"),
            callback: async () => {
                if (!this.syncLock) {
                    await this.sync();
                    new StatsModal(this.app, this).open();
                }
            },
        });

        this.settingTab = new SRSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);

        this.app.workspace.onLayoutReady(() => {
            this.initView();
            setTimeout(async () => {
                if (!this.syncLock) {
                    await this.sync();
                }
            }, 2000);
        });
    }

    onunload(): void {
        console.log("Unloading Obsidian spaced repetition Recall. ...");
        this.app.workspace.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE).forEach((leaf) => leaf.detach());
        // if (this.data.settings.dataLocation === DataLocation.SaveOnNoteFile) {
        //     return;
        // }
        // this.store.save();
        // console.log("tracked files saved.");
    }

    private async openFlashcardModalForSingleNote(
        noteFile: TFile,
        reviewMode: FlashcardReviewMode,
    ): Promise<void> {
        const topicPath: TopicPath = this.findTopicPath(this.createSrTFile(noteFile));
        const note: Note = await this.loadNote(noteFile, topicPath);

        const deckTree = new Deck("root", null);
        note.appendCardsToDeck(deckTree);
        const remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.questionPostponementList,
            deckTree,
            reviewMode,
        );
        this.openFlashcardModal(deckTree, remainingDeckTree, reviewMode);
    }

    private openFlashcardModal(
        fullDeckTree: Deck,
        remainingDeckTree: Deck,
        reviewMode: FlashcardReviewMode,
    ): void {
        const deckIterator = SRPlugin.createDeckTreeIterator(this.data.settings);
        const cardScheduleCalculator = new CardScheduleCalculator(
            this.data.settings,
            this.easeByPath,
        );
        const reviewSequencer: IFlashcardReviewSequencer = new FlashcardReviewSequencer(
            reviewMode,
            deckIterator,
            this.data.settings,
            cardScheduleCalculator,
            this.questionPostponementList,
        );

        reviewSequencer.setDeckTree(fullDeckTree, remainingDeckTree);
        new FlashcardModal(this.app, this, this.data.settings, reviewSequencer, reviewMode).open();
    }

    private static createDeckTreeIterator(settings: SRSettings): IDeckTreeIterator {
        const iteratorOrder: IIteratorOrder = {
            deckOrder: OrderMethod.Sequential,
            cardListOrder: CardListOrder.DueFirst,
            cardOrder: settings.randomizeCardOrder ? OrderMethod.Random : OrderMethod.Sequential,
        };
        return new DeckTreeIterator(iteratorOrder, IteratorDeckSource.UpdatedByIterator);
    }

    async sync(): Promise<void> {
        if (this.data.settings.dataLocation != DataLocation.SaveOnNoteFile) {
            await this.sync_Algo();
            return;
        }

        if (this.syncLock) {
            return;
        }
        this.syncLock = true;

        // reset notes stuff
        graph.reset();
        this.easeByPath = new NoteEaseList(this.data.settings);
        this.incomingLinks = {};
        this.pageranks = {};
        this.dueNotesCount = 0;
        this.dueDatesNotes = {};
        this.reviewDecks = {};

        this.noteStats = new Stats();

        // reset flashcards stuff
        const fullDeckTree = new Deck("root", null);

        const now = window.moment(Date.now());
        const todayDate: string = now.format("YYYY-MM-DD");
        // clear bury list if we've changed dates
        if (todayDate !== this.data.buryDate) {
            this.data.buryDate = todayDate;
            this.questionPostponementList.clear();

            // The following isn't needed for plug-in functionality; but can aid during debugging
            await this.savePluginData();
        }

        const notes: TFile[] = this.app.vault.getMarkdownFiles();
        for (const noteFile of notes) {
            if (
                this.data.settings.noteFoldersToIgnore.some((folder) =>
                    // note.path.startsWith(folder)
                    noteFile.path.includes(folder),
                )
            ) {
                continue;
            }

            updategraphLink(this.incomingLinks, noteFile);

            const topicPath: TopicPath = this.findTopicPath(this.createSrTFile(noteFile));
            if (topicPath.hasPath) {
                const note: Note = await this.loadNote(noteFile, topicPath);
                const flashcardsInNoteAvgEase: number = NoteEaseCalculator.Calculate(
                    note,
                    this.data.settings,
                );
                note.appendCardsToDeck(fullDeckTree);

                if (flashcardsInNoteAvgEase > 0) {
                    this.easeByPath.setEaseForPath(note.filePath, flashcardsInNoteAvgEase);
                }
            }

            const fileCachedData = this.app.metadataCache.getFileCache(noteFile) || {};

            const frontmatter: FrontMatterCache | Record<string, unknown> =
                fileCachedData.frontmatter || {};
            const tags = getAllTags(fileCachedData) || [];

            let shouldIgnore = true;
            const matchedNoteTags = [];

            for (const tagToReview of this.data.settings.tagsToReview) {
                if (tags.some((tag) => tag === tagToReview || tag.startsWith(tagToReview + "/"))) {
                    if (!Object.prototype.hasOwnProperty.call(this.reviewDecks, tagToReview)) {
                        this.reviewDecks[tagToReview] = new ReviewDeck(tagToReview);
                    }
                    matchedNoteTags.push(tagToReview);
                    shouldIgnore = false;
                    break;
                }
            }
            if (shouldIgnore) {
                continue;
            }

            // file has no scheduling information
            if (
                !(
                    Object.prototype.hasOwnProperty.call(frontmatter, "sr-due") &&
                    Object.prototype.hasOwnProperty.call(frontmatter, "sr-interval") &&
                    Object.prototype.hasOwnProperty.call(frontmatter, "sr-ease")
                )
            ) {
                for (const matchedNoteTag of matchedNoteTags) {
                    this.reviewDecks[matchedNoteTag].newNotes.push(noteFile);
                }
                this.noteStats.incrementNew();
                continue;
            }

            const dueUnix: number = window
                .moment(frontmatter["sr-due"], ["YYYY-MM-DD", "DD-MM-YYYY", "ddd MMM DD YYYY"])
                .valueOf();

            for (const matchedNoteTag of matchedNoteTags) {
                this.reviewDecks[matchedNoteTag].scheduledNotes.push({ note: noteFile, dueUnix });
                if (dueUnix <= now.valueOf()) {
                    this.reviewDecks[matchedNoteTag].dueNotesCount++;
                }
            }

            let ease: number;
            if (this.easeByPath.hasEaseForPath(noteFile.path)) {
                ease = (this.easeByPath.getEaseByPath(noteFile.path) + frontmatter["sr-ease"]) / 2;
            } else {
                ease = frontmatter["sr-ease"];
            }
            this.easeByPath.setEaseForPath(noteFile.path, ease);

            if (dueUnix <= now.valueOf()) {
                this.dueNotesCount++;
                this.noteStats.incrementOnDue();
            }

            const nDays: number = Math.ceil((dueUnix - now.valueOf()) / (24 * 3600 * 1000));
            if (!Object.prototype.hasOwnProperty.call(this.dueDatesNotes, nDays)) {
                this.dueDatesNotes[nDays] = 0;
            }
            this.dueDatesNotes[nDays]++;
            const interval = Number(frontmatter["sr-interval"]);
            this.noteStats.update(nDays, interval, ease);
        }

        graph.rank(0.85, 0.000001, (node: string, rank: number) => {
            this.pageranks[node] = rank * 10000;
        });

        // Reviewable cards are all except those with the "edit later" tag
        this.deckTree = DeckTreeFilter.filterForReviewableCards(fullDeckTree);

        // sort the deck names
        this.deckTree.sortSubdecksList();
        this.remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.questionPostponementList,
            this.deckTree,
            FlashcardReviewMode.Review,
        );
        const calc: DeckTreeStatsCalculator = new DeckTreeStatsCalculator();
        this.cardStats = calc.calculate(this.deckTree);

        if (this.data.settings.showDebugMessages) {
            this.showSyncInfo();
        }

        for (const deckKey in this.reviewDecks) {
            this.reviewDecks[deckKey].sortNotes(this.pageranks);
        }

        if (this.data.settings.showDebugMessages) {
            console.log(
                "SR: " +
                    t("SYNC_TIME_TAKEN", {
                        t: Date.now() - now.valueOf(),
                    }),
            );
        }

        this.statusBar.setText(
            t("STATUS_BAR", {
                dueNotesCount: this.dueNotesCount,
                dueFlashcardsCount: this.remainingDeckTree.getCardCount(CardListType.All, true),
            }),
        );

        if (this.data.settings.enableNoteReviewPaneOnStartup) this.reviewQueueView.redraw();
        this.syncLock = false;
    }

    async sync_Algo(): Promise<void> {
        if (this.syncLock) {
            return;
        }
        this.syncLock = true;
        const store = this.store;

        // reset notes stuff
        graph.reset();
        this.easeByPath = new NoteEaseList(this.data.settings);
        this.incomingLinks = {};
        this.pageranks = {};
        this.dueNotesCount = 0;
        this.dueDatesNotes = {};
        this.reviewDecks = {};

        // reset flashcards stuff
        const fullDeckTree = new Deck("root", null);
        this.deckTree = new Deck("root", null);
        // this.cardStats = {};

        this.noteStats = new Stats();

        // check trackfile
        store.reLoad();

        let now_number = Date.now();
        const now = window.moment(now_number);
        const todayDate: string = now.format("YYYY-MM-DD");
        // clear bury list if we've changed dates
        if (todayDate !== this.data.buryDate) {
            now_number = DateUtils.EndofToday;
            this.data.buryDate = todayDate;
            this.questionPostponementList.clear();
        }

        const notes: TFile[] = this.app.vault.getMarkdownFiles();
        for (const noteFile of notes) {
            if (isIgnoredPath(this.data.settings.noteFoldersToIgnore, noteFile.path)) {
                continue;
            }

            updategraphLink(this.incomingLinks, noteFile);

            const topicPath: TopicPath = this.findTopicPath(this.createSrTFile(noteFile));
            if (topicPath.hasPath) {
                const note: Note = await this.loadNote(noteFile, topicPath);
                const flashcardsInNoteAvgEase: number = NoteEaseCalculator.Calculate(
                    note,
                    this.data.settings,
                );
                note.appendCardsToDeck(fullDeckTree);

                if (flashcardsInNoteAvgEase > 0) {
                    this.easeByPath.setEaseForPath(note.filePath, flashcardsInNoteAvgEase);
                }
            }

            const settings = this.data.settings;
            let deckname = Tags.getNoteDeckName(noteFile, this.data.settings);
            if (deckname == null) {
                const tf = store.getTrackedFile(noteFile.path);
                const tag = tf?.lastTag;
                if (tag != undefined && settings.tagsToReview.includes(tag)) {
                    deckname = tag;
                }
            }
            if (deckname != null) {
                if (!Object.prototype.hasOwnProperty.call(this.reviewDecks, deckname)) {
                    this.reviewDecks[deckname] = new ReviewDeck(deckname);
                }
                // update single note deck data, only tagged reviewnote
                if (!store.isTracked(noteFile.path)) {
                    store.trackFile(noteFile.path, deckname, false);
                    this.noteStats.incrementNew();
                } else {
                    const id = store.getFileId(noteFile.path);
                    const item = store.getItembyID(id);
                    this.noteStats.updateStats(item, DateUtils.EndofToday);
                }
                const result = DataSyncer.syncRCDataToSRrevDeck(
                    this.reviewDecks[deckname],
                    noteFile,
                    now_number,
                );
                this.dueNotesCount += result;

                const id = store.getFileId(noteFile.path);

                if (
                    settings.algorithm === algorithmNames.Anki ||
                    settings.algorithm === algorithmNames.Default ||
                    settings.algorithm === algorithmNames.SM2
                ) {
                    const sched = store.getSchedbyId(id);
                    if (sched != null) {
                        const ease: number = parseFloat(sched[3]);
                        if (!isNaN(ease)) {
                            // this.plugin.easeByPath just update in plugin.sync(), shouldn't update in pulgin.singNoteSyncQueue()
                            if (this.easeByPath.hasEaseForPath(noteFile.path)) {
                                this.easeByPath.setEaseForPath(
                                    noteFile.path,
                                    (this.easeByPath.getEaseByPath(noteFile.path) + ease) / 2,
                                );
                            } else {
                                this.easeByPath.setEaseForPath(noteFile.path, ease);
                            }
                        }
                    }
                }
            }
        }

        graph.rank(0.85, 0.000001, (node: string, rank: number) => {
            this.pageranks[node] = rank * 10000;
        });

        // Add Recall reviewnote deck
        const dkname = store.defaultDackName;
        if (!Object.prototype.hasOwnProperty.call(this.reviewDecks, dkname)) {
            this.reviewDecks[dkname] = new ReviewDeck(dkname);
        }
        const dueCount = DataSyncer.syncRCsrsDataToSRreviewDecks(
            this.reviewDecks,
            dkname,
            this.noteStats,
        );
        this.dueNotesCount += dueCount;

        // Reviewable cards are all except those with the "edit later" tag
        this.deckTree = DeckTreeFilter.filterForReviewableCards(fullDeckTree);

        // sort the deck names
        this.deckTree.sortSubdecksList();
        this.remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.questionPostponementList,
            this.deckTree,
            FlashcardReviewMode.Review,
        );
        const calc: DeckTreeStatsCalculator = new DeckTreeStatsCalculator();
        this.cardStats = calc.calculate(this.deckTree);
        // this.noteStats = calc.calculate(this.deckTree);

        if (this.data.settings.showDebugMessages) {
            this.showSyncInfo();
        }

        for (const deckKey in this.reviewDecks) {
            this.reviewDecks[deckKey].sortNotes(this.pageranks);
        }

        if (this.data.settings.showDebugMessages) {
            console.log(
                "SR: " +
                    t("SYNC_TIME_TAKEN", {
                        t: Date.now() - now.valueOf(),
                    }),
            );
        }

        this.updateStatusBar();

        if (this.data.settings.enableNoteReviewPaneOnStartup) this.reviewQueueView.redraw();
        this.syncLock = false;
    }

    async loadNote(noteFile: TFile, topicPath: TopicPath): Promise<Note> {
        const loader: NoteFileLoader = new NoteFileLoader(this.data.settings);
        const note: Note = await loader.load(this.createSrTFile(noteFile), topicPath);
        const settings = this.data.settings;
        if (topicPath.hasPath && settings.dataLocation !== DataLocation.SaveOnNoteFile) {
            const store = this.store;
            const deckname = topicPath.path[0];
            if (store.getFileIndex(noteFile.path) < 0) {
                if (
                    settings.trackedNoteToDecks &&
                    (deckname === store.defaultDackName ||
                        Tags.getNoteDeckName(noteFile, settings) !== null)
                ) {
                    store.trackFile(noteFile.path, RPITEMTYPE.NOTE, false);
                } else {
                    store.trackFile(noteFile.path, RPITEMTYPE.CARD, false);
                }
            }
            DataSyncer.updateCardsSched_algo(note, topicPath);
        }
        if (note.hasChanged) note.writeNoteFile(this.data.settings);
        return note;
    }

    async saveReviewResponse(note: TFile, response: ReviewResponse): Promise<void> {
        const settings = this.data.settings;
        if (this.data.settings.dataLocation !== DataLocation.SaveOnNoteFile) {
            const deckName = ReviewNote.getDeckName(settings, note);
            if (deckName == null) return;
            const opt = this.algorithm.srsOptions()[response];
            const ease = this.getLinkedEase(note);
            const store = this.store;
            const fileId = store.getFileId(note.path);
            const item = store.getItembyID(fileId);
            this.noteStats.decrementStats(item);
            const result = ReviewNote.saveReviewResponsebyAlgo(
                this.reviewDecks[deckName],
                note,
                opt,
                settings.burySiblingCards,
                ease,
            );
            this.noteStats.updateStats(item);
            this.dueNotesCount += result.dueNotesCount;
            if (settings.burySiblingCards) {
                this.data.buryList.push(...result.buryList);
                await this.savePluginData();
            }
            this.reviewDecks[deckName].sortNotes(this.pageranks);
            this.updateStatusBar();
            if (settings.autoNextNote) {
                this.reviewNextNote(deckName);
            }
            return;
        }
        const fileCachedData = this.app.metadataCache.getFileCache(note) || {};
        const frontmatter: FrontMatterCache | Record<string, unknown> =
            fileCachedData.frontmatter || {};

        const tags = getAllTags(fileCachedData) || [];
        if (this.data.settings.noteFoldersToIgnore.some((folder) => note.path.startsWith(folder))) {
            new Notice(t("NOTE_IN_IGNORED_FOLDER"));
            return;
        }

        let shouldIgnore = true;
        for (const tag of tags) {
            if (
                this.data.settings.tagsToReview.some(
                    (tagToReview) => tag === tagToReview || tag.startsWith(tagToReview + "/"),
                )
            ) {
                shouldIgnore = false;
                break;
            }
        }

        if (shouldIgnore) {
            new Notice(t("PLEASE_TAG_NOTE"));
            return;
        }

        let fileText: string = await this.app.vault.read(note);
        let ease: number, interval: number, delayBeforeReview: number;
        const now: number = Date.now();
        // new note
        if (
            !(
                Object.prototype.hasOwnProperty.call(frontmatter, "sr-due") &&
                Object.prototype.hasOwnProperty.call(frontmatter, "sr-interval") &&
                Object.prototype.hasOwnProperty.call(frontmatter, "sr-ease")
            )
        ) {
            let linkTotal = 0,
                linkPGTotal = 0,
                totalLinkCount = 0;

            for (const statObj of this.incomingLinks[note.path] || []) {
                const ease: number = this.easeByPath.getEaseByPath(statObj.sourcePath);
                if (ease) {
                    linkTotal += statObj.linkCount * this.pageranks[statObj.sourcePath] * ease;
                    linkPGTotal += this.pageranks[statObj.sourcePath] * statObj.linkCount;
                    totalLinkCount += statObj.linkCount;
                }
            }

            const outgoingLinks = this.app.metadataCache.resolvedLinks[note.path] || {};
            for (const linkedFilePath in outgoingLinks) {
                const ease: number = this.easeByPath.getEaseByPath(linkedFilePath);
                if (ease) {
                    linkTotal +=
                        outgoingLinks[linkedFilePath] * this.pageranks[linkedFilePath] * ease;
                    linkPGTotal += this.pageranks[linkedFilePath] * outgoingLinks[linkedFilePath];
                    totalLinkCount += outgoingLinks[linkedFilePath];
                }
            }

            const linkContribution: number =
                this.data.settings.maxLinkFactor *
                Math.min(1.0, Math.log(totalLinkCount + 0.5) / Math.log(64));
            ease =
                (1.0 - linkContribution) * this.data.settings.baseEase +
                (totalLinkCount > 0
                    ? (linkContribution * linkTotal) / linkPGTotal
                    : linkContribution * this.data.settings.baseEase);
            // add note's average flashcard ease if available
            if (this.easeByPath.hasEaseForPath(note.path)) {
                ease = (ease + this.easeByPath.getEaseByPath(note.path)) / 2;
            }
            ease = Math.round(ease);
            interval = 1.0;
            delayBeforeReview = 0;
        } else {
            interval = frontmatter["sr-interval"];
            ease = frontmatter["sr-ease"];
            delayBeforeReview =
                now -
                window
                    .moment(frontmatter["sr-due"], ["YYYY-MM-DD", "DD-MM-YYYY", "ddd MMM DD YYYY"])
                    .valueOf();
        }

        const schedObj: Record<string, number> = schedule(
            response,
            interval,
            ease,
            delayBeforeReview,
            this.data.settings,
            this.dueDatesNotes,
        );
        interval = schedObj.interval;
        ease = schedObj.ease;

        const due = window.moment(now + interval * 24 * 3600 * 1000);
        const dueString: string = due.format("YYYY-MM-DD");

        // check if scheduling info exists
        if (SCHEDULING_INFO_REGEX.test(fileText)) {
            const schedulingInfo = SCHEDULING_INFO_REGEX.exec(fileText);
            fileText = fileText.replace(
                SCHEDULING_INFO_REGEX,
                `---\n${schedulingInfo[1]}sr-due: ${dueString}\n` +
                    `sr-interval: ${interval}\nsr-ease: ${ease}\n` +
                    `${schedulingInfo[5]}---\n`,
            );
        } else if (YAML_FRONT_MATTER_REGEX.test(fileText)) {
            // new note with existing YAML front matter
            const existingYaml = YAML_FRONT_MATTER_REGEX.exec(fileText);
            fileText = fileText.replace(
                YAML_FRONT_MATTER_REGEX,
                `---\n${existingYaml[1]}sr-due: ${dueString}\n` +
                    `sr-interval: ${interval}\nsr-ease: ${ease}\n---`,
            );
        } else {
            fileText =
                `---\nsr-due: ${dueString}\nsr-interval: ${interval}\n` +
                `sr-ease: ${ease}\n---\n\n${fileText}`;
        }

        if (this.data.settings.burySiblingCards) {
            const topicPath: TopicPath = this.findTopicPath(this.createSrTFile(note));
            const noteX: Note = await this.loadNote(note, topicPath);
            for (const question of noteX.questionList) {
                this.data.buryList.push(question.questionText.textHash);
            }
            await this.savePluginData();
        }
        await this.app.vault.modify(note, fileText);

        new Notice(t("RESPONSE_RECEIVED"));

        await this.sync();
        if (this.data.settings.autoNextNote) {
            this.reviewNextNote(this.lastSelectedReviewDeck);
        }
    }

    async reviewNextNoteModal(): Promise<void> {
        const reviewDeckNames: string[] = Object.keys(this.reviewDecks);
        if (this.data.settings.reviewingNoteDirectly) {
            const rdname =
                this.lastSelectedReviewDeck ??
                ReviewNote.getDeckNameForReviewDirectly(this.reviewDecks) ??
                reviewDeckNames[0];
            this.reviewNextNote(rdname);
        } else if (reviewDeckNames.length === 1) {
            this.reviewNextNote(reviewDeckNames[0]);
        } else {
            const deckSelectionModal = new ReviewDeckSelectionModal(this.app, reviewDeckNames);
            deckSelectionModal.submitCallback = (deckKey: string) => this.reviewNextNote(deckKey);
            deckSelectionModal.open();
        }
    }

    async reviewNextNote(deckKey: string): Promise<void> {
        if (!Object.prototype.hasOwnProperty.call(this.reviewDecks, deckKey)) {
            new Notice(t("NO_DECK_EXISTS", { deckName: deckKey }));
            return;
        }

        this.lastSelectedReviewDeck = deckKey;
        const deck = this.reviewDecks[deckKey];
        let show = false;
        let path = "";
        let index = -1;

        index = ReviewNote.getNextDueNoteIndex(
            deck.dueNotesCount,
            this.data.settings.openRandomNote,
        );
        if (index >= 0) {
            await this.app.workspace.getLeaf().openFile(deck.scheduledNotes[index].note);
            path = deck.scheduledNotes[index].note.path;
            show = true;
            // return;
        } else if (deck.newNotes.length > 0) {
            const index = this.data.settings.openRandomNote
                ? Math.floor(Math.random() * deck.newNotes.length)
                : 0;
            this.app.workspace.getLeaf().openFile(deck.newNotes[index]);
            path = deck.newNotes[index].path;
            show = true;
            // return;
        }
        if (show) {
            if (this.data.settings.dataLocation !== DataLocation.SaveOnNoteFile) {
                // reviewedNote update interval
                const id = this.store.getFileId(path);
                const item = this.store.getItembyID(id);
                // console.debug("item:", item);
                this.reviewFloatBar.algoDisplay(true, item);
            }

            return;
        }

        // add repeat items to review.
        // this.store.loadRepeatQueue(this.reviewDecks);

        if (
            this.data.settings.reviewingNoteDirectly &&
            this.noteStats.onDueCount + this.noteStats.newCount > 0
        ) {
            const rdname: string = ReviewNote.getDeckNameForReviewDirectly(this.reviewDecks);
            if (rdname != undefined) {
                this.reviewNextNote(rdname);
                return;
            }
        }

        ReviewNote.nextReviewNotice(Queue.getInstance().toDayLatterQueue);

        this.updateStatusBar();

        this.reviewFloatBar.selfDestruct();
        this.reviewQueueView.redraw();
        new Notice(t("ALL_CAUGHT_UP"));
    }

    createSrTFile(note: TFile): SrTFile {
        return new SrTFile(this.app.vault, this.app.metadataCache, note);
    }

    findTopicPath(note: ISRFile): TopicPath {
        return TopicPath.getTopicPathOfFile(note, this.data.settings, this.store);
    }

    async loadPluginData(): Promise<void> {
        this.data = Object.assign({}, DEFAULT_DATA, await this.loadData());
        this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings);
        this.store = new DataStore(this.data.settings, this.manifest.dir);
        await this.store.load();
    }

    async savePluginData(): Promise<void> {
        await this.saveData(this.data);
    }

    initView(): void {
        this.syncLock = true;
        this.registerView(
            REVIEW_QUEUE_VIEW_TYPE,
            (leaf) => (this.reviewQueueView = new ReviewQueueListView(leaf, this)),
        );

        if (
            this.data.settings.enableNoteReviewPaneOnStartup &&
            this.app.workspace.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE).length == 0
        ) {
            this.app.workspace.getRightLeaf(false).setViewState({
                type: REVIEW_QUEUE_VIEW_TYPE,
                active: true,
            });
        }
        this.syncLock = false;
    }

    showSyncInfo() {
        console.log(`SR: ${t("EASES")}`, this.easeByPath);
        console.log(`SR: ${t("DECKS")}`, this.deckTree);
        console.log(`SR: NOTE ${t("DECKS")}`, this.reviewDecks);
        console.log("SR: cardStats ", this.cardStats);
        console.log("SR: noteStats ", this.noteStats);
        console.log("SR: this.dueDatesNotes", this.dueDatesNotes);
    }

    updateStatusBar() {
        this.statusBar.setText(
            t("STATUS_BAR", {
                dueNotesCount: this.noteStats.onDueCount,
                dueFlashcardsCount: this.remainingDeckTree.getCardCount(CardListType.All, true),
            }),
        );
    }

    getLinkedEase(note: TFile) {
        const settings = this.data.settings;
        if (
            settings.algorithm === algorithmNames.Anki ||
            settings.algorithm === algorithmNames.Default ||
            settings.algorithm === algorithmNames.SM2
        ) {
            const ease = calcLinkContribution(
                note,
                this.easeByPath,
                this.incomingLinks,
                this.pageranks,
                settings,
            ).ease;
            return ease;
        }
    }
}
