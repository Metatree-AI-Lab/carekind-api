import { Injectable } from "@nestjs/common";
import {
	NurseWorkloadReader,
	type DbTransaction,
	type NurseWorkloadCounts,
	type ResidentOpenItemCounts,
} from "../application/ports";

// 第一阶段没有护士端：草稿、审核项、FollowUp、交接、导出记录这些表都还不存在，所以计数如实为 0。
// 第二阶段护士端提供真实实现（按 providerId 查询护士端的表），替换这个类即可，调用方不用改。
// 为什么不返回"未知"：没有护士端就不可能有这些待办，0 是真实值，不是占位数字。

@Injectable()
export class PhaseOneNurseWorkloadReader extends NurseWorkloadReader {
	async forStaff(_transaction: DbTransaction, _providerId: string, _staffId: string): Promise<Map<string, NurseWorkloadCounts>> {
		return new Map();
	}

	async forResident(_transaction: DbTransaction, _providerId: string, _residentId: string): Promise<ResidentOpenItemCounts> {
		return { unconfirmedDrafts: 0, unassignedSegments: 0, openFollowUps: 0, unacceptedHandovers: 0 };
	}

	async unexportedConfirmedRecords(_transaction: DbTransaction, _providerId: string): Promise<number> {
		return 0;
	}

	async residentsWithConfirmedRecords(
		_transaction: DbTransaction,
		_providerId: string,
		_residentIds: string[],
	): Promise<Set<string>> {
		return new Set();
	}
}
