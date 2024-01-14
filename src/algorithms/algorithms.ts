import { MiscUtils } from "src/util/utils_recall";
import { RPITEMTYPE, RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";

export enum algorithmNames {
    Default = "Default",
    Anki = "Anki",
    Fsrs = "Fsrs",
    SM2 = "SM2",
}

export abstract class SrsAlgorithm {
    settings: unknown;
    // plugin: SRPlugin;
    private dueDates: { [type: string]: Record<number, number> };
    public static instance: SrsAlgorithm;

    public static getInstance(): SrsAlgorithm {
        if (!SrsAlgorithm.instance) {
            // SrsAlgorithm.instance = new SrsAlgorithm();
            throw Error("there is not algorithm instance.");
        }
        return SrsAlgorithm.instance;
    }

    updateSettings(settings: unknown) {
        this.settings = MiscUtils.assignOnly(this.defaultSettings(), settings);
        // this.plugin = plugin;
        SrsAlgorithm.instance = this;
    }
    setDueDates(notedueDates: Record<number, number>, carddueDates: Record<number, number>) {
        this.dueDates = {};
        this.dueDates[RPITEMTYPE.NOTE] = notedueDates;
        this.dueDates[RPITEMTYPE.CARD] = carddueDates;
    }
    getDueDates(itemType: string) {
        return this.dueDates && itemType in this.dueDates ? this.dueDates[itemType] : undefined;
    }

    abstract defaultSettings(): unknown;
    abstract defaultData(): unknown;
    abstract onSelection(item: RepetitionItem, option: string, repeat: boolean): ReviewResult;
    abstract calcAllOptsIntervals(item: RepetitionItem): number[];
    abstract srsOptions(): string[];
    abstract importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void;
    abstract displaySettings(
        containerEl: HTMLElement,
        update: (settings: unknown, refresh?: boolean) => void,
    ): void;
}
