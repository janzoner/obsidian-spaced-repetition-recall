import { algorithmNames } from "./algorithms_switch";
import { RPITEMTYPE, ReviewResult } from "src/dataStore/data";
import SRPlugin from "../main";
import { MiscUtils } from "src/util/utils_recall";
import { RepetitionItem } from "src/dataStore/repetitionItem";

export default abstract class SrsAlgorithm {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings: any;
    plugin: SRPlugin;
    public static instance: SrsAlgorithm;

    public static getInstance(): SrsAlgorithm {
        if (!SrsAlgorithm.instance) {
            // SrsAlgorithm.instance = new SrsAlgorithm();
            throw Error("there is not algorithm instance.");
        }
        return SrsAlgorithm.instance;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateSettings(plugin: SRPlugin, settings: any) {
        this.settings = MiscUtils.assignOnly(this.defaultSettings(), settings);
        this.plugin = plugin;
        SrsAlgorithm.instance = plugin.algorithm;
    }

    getDueDates(itemType: RPITEMTYPE) {
        const dueDates =
            itemType === RPITEMTYPE.NOTE
                ? this.plugin.noteStats.delayedDays.dict
                : this.plugin.cardStats.delayedDays.dict;
        return dueDates;
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
