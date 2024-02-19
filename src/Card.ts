import { Question } from "./Question";
import { CardScheduleInfo } from "./CardSchedule";
import { CardListType } from "./Deck";

export class Card {
    question: Question;
    cardIdx: number;
    Id?: number;
    multiClozeIndex?: number;
    multiCloze?: number[];
    // scheduling
    get hasSchedule(): boolean {
        return this.scheduleInfo != null;
    }
    scheduleInfo?: CardScheduleInfo;

    // visuals
    front: string;
    back: string;

    constructor(init?: Partial<Card>) {
        Object.assign(this, init);
    }

    get cardListType(): CardListType {
        return this.isNew ? CardListType.NewCard : CardListType.DueCard;
    }

    get isNew(): boolean {
        return !this.hasSchedule || this.scheduleInfo.isDummyScheduleForNewCard();
    }

    get isDue(): boolean {
        return this.hasSchedule && this.scheduleInfo.isDue();
    }

    get isMultiCloze(): boolean {
        return this?.multiClozeIndex >= 0;
    }

    /**
     * 3 cloze in a group, but last group could have 4 cloze.
     */
    get hasNextMultiCloze(): boolean {
        if (this.isMultiCloze && this.multiClozeIndex + 1 < this.multiCloze.length) {
            const len = this.multiCloze.length;
            if (len % 3 === 1 && len - this.multiClozeIndex <= 4) {
                return true;
            } else if (this.multiClozeIndex % 3 < 2) {
                return true;
            }
        }
        return false;
    }

    private getFirstMultiClozeIndex(): number {
        let result = -1;
        if (this.isMultiCloze) {
            const len = this.multiCloze.length;
            if (this.multiCloze.length <= 4) {
                result = 0;
            } else if (len % 3 === 1 && len - this.multiClozeIndex <= 4) {
                result = len - 4;
            } else {
                result = Math.floor(this.multiClozeIndex / 3) * 3;
            }
        }
        return result;
    }

    private getNextMultiClozeIndex(): number {
        return this.hasNextMultiCloze ? this.multiClozeIndex + 1 : -1;
    }

    getFirstClozeCard(): Card {
        return this.question.cards[this.multiCloze[this.getFirstMultiClozeIndex()]];
    }

    getNextClozeCard(): Card {
        return this.question.cards[this.multiCloze[this.getNextMultiClozeIndex()]];
    }

    formatSchedule(): string {
        let result: string = "";
        if (this.hasSchedule) result = this.scheduleInfo.formatSchedule();
        else result = "New";
        return result;
    }
}
