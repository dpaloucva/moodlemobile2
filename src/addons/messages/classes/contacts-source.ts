// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { CoreRoutedItemsManagerSource } from '@classes/items-management/routed-items-manager-source';
import { AddonMessages, AddonMessagesConversationMember, AddonMessagesProvider } from '../services/messages';

/**
 * Provides a collection of contacts.
 */
export class AddonMessagesContactsSource extends CoreRoutedItemsManagerSource<AddonMessagesConversationMember> {

    fetchFailed = false;

    /**
     * @inheritdoc
     */
    getItemPath(user: AddonMessagesConversationMember): string {
        return `discussion/user/${user.id}`;
    }

    /**
     * @inheritdoc
     */
    protected getPageLength(): number {
        return AddonMessagesProvider.LIMIT_CONTACTS;
    }

    /**
     * @inheritdoc
     */
    protected async loadPageItems(page: number): Promise<{ items: AddonMessagesConversationMember[]; hasMoreItems: boolean }> {
        try {
            const limitFrom = page * this.getPageLength();
            this.fetchFailed = false;

            const result = await AddonMessages.getUserContacts(limitFrom, this.getPageLength());

            return {
                items: result.contacts,
                hasMoreItems: result.canLoadMore,
            };
        } catch (error) {
            this.fetchFailed = true;

            throw error;
        }
    }

    /**
     * Invalidate cache.
     */
    async invalidateCache(): Promise<void> {
        await AddonMessages.invalidateUserContacts();
    }

}
