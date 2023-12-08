import { algorithmNames } from "./algorithms_switch";
import { ReviewResult } from "src/dataStore/data";
import { MiscUtils } from "src/util/utils_recall";
import { RPITEMTYPE, RepetitionItem } from "src/dataStore/repetitionItem";

export default abstract class SrsAlgorithm {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings: any;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateSettings(settings: any) {
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
        return this.dueDates[itemType];
    }

    abstract defaultSettings(): unknown;
    abstract defaultData(): unknown;
    abstract onSelection(item: RepetitionItem, option: string, repeat: boolean): ReviewResult;
    abstract calcAllOptsIntervals(item: RepetitionItem): number[];
    abstract srsOptions(): string[];
    abstract importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract displaySettings(containerEl: HTMLElement, update: (settings: any) => void): void;
}
