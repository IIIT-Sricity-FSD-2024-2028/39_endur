export declare class CreateFeedbackCycleDto {
    cycleName: string;
    type?: string;
    startTimestamp: string;
    endTimestamp: string;
    reflectionDeadline?: string;
    actionReportDeadline?: string;
}
export declare class UpdateFeedbackCycleDto {
    cycleName?: string;
    type?: string;
    startTimestamp?: string;
    endTimestamp?: string;
    reflectionDeadline?: string;
    actionReportDeadline?: string;
}
export declare class UpdateCycleStatusDto {
    status: string;
    phase?: string;
}
