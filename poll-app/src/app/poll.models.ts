export interface OptionVote {
    voteOption: string;
    voteCount: number;
}

export interface Poll {
    id?: number;
    question: string;
    options: OptionVote[];
}
