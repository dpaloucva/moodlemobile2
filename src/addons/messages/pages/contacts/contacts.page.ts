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

import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreSites } from '@services/sites';
import {
    AddonMessages,
    AddonMessagesConversationMember,
    AddonMessagesProvider,
} from '../../services/messages';
import { CoreNavigator } from '@services/navigator';
import { CoreDomUtils } from '@services/utils/dom';
import { IonRefresher } from '@ionic/angular';
import { CoreSplitViewComponent } from '@components/split-view/split-view';
import { CoreListItemsManager } from '@classes/items-management/list-items-manager';
import { AddonMessagesContactsSource } from '@addons/messages/classes/contacts-source';
import { AddonMessagesContactRequestsSource } from '@addons/messages/classes/contact-requests-source';
import { ActivatedRoute } from '@angular/router';
import { CoreRoutedItemsManagerSourcesTracker } from '@classes/items-management/routed-items-manager-sources-tracker';

/**
 * Page that displays contacts and contact requests.
 */
@Component({
    selector: 'page-addon-messages-contacts',
    templateUrl: 'contacts.html',
    styleUrls: [
        '../../messages-common.scss',
    ],
})
export class AddonMessagesContactsPage implements OnInit, OnDestroy {

    @ViewChild(CoreSplitViewComponent) splitView!: CoreSplitViewComponent;

    requestsBadge = '';
    contactsManager: AddonMessagesContactsManager;
    contactsType = AddonMessagesContactsListTypes.CONTACTS;
    requestsType = AddonMessagesContactsListTypes.REQUESTS;

    protected siteId: string;
    protected contactRequestsCountObserver: CoreEventObserver;
    protected memberInfoObserver: CoreEventObserver;

    constructor() {

        this.siteId = CoreSites.getCurrentSiteId();

        this.contactsManager = new AddonMessagesContactsManager(
            CoreRoutedItemsManagerSourcesTracker.getOrCreateSource(AddonMessagesContactsSource, []),
            AddonMessagesContactsPage,
            CoreRoutedItemsManagerSourcesTracker.getOrCreateSource(AddonMessagesContactRequestsSource, []),
        );

        // Update the contact requests badge.
        this.contactRequestsCountObserver = CoreEvents.on(
            AddonMessagesProvider.CONTACT_REQUESTS_COUNT_EVENT,
            (data) => {
                const newCount = data.count > 0 ? String(data.count) : '';
                if (newCount === this.requestsBadge) {
                    return;
                }

                this.requestsBadge = newCount;
                this.refreshRequests();
            },
            this.siteId,
        );

        // Update status of a user.
        this.memberInfoObserver = CoreEvents.on(
            AddonMessagesProvider.MEMBER_INFO_CHANGED_EVENT,
            (data) => {
                if (data.userBlocked || data.userUnblocked) {
                    const user = this.contactsManager.contacts.find((user) => user.id == data.userId);
                    if (user) {
                        user.isblocked = !!data.userBlocked;
                    }
                } else if (data.contactRemoved || data.contactRequestConfirmed) {
                    this.refreshContacts();
                }

                if (data.contactRequestConfirmed || data.contactRequestDeclined) {
                    this.refreshRequests();
                }
            },
            CoreSites.getCurrentSiteId(),
        );
    }

    /**
     * Page being initialized.
     */
    async ngOnInit(): Promise<void> {
        AddonMessages.getContactRequestsCount(this.siteId); // Badge already updated by the observer.

        // Always try to get latest data from server when opening the page.
        await this.contactsManager.invalidateCache(true);

        await this.fetchData();

        await this.contactsManager.start(this.splitView);
    }

    /**
     * Fetch data.
     */
    protected async fetchData(): Promise<void> {
        try {
            await this.contactsManager.load();
        } catch (error) {
            CoreDomUtils.showErrorModalDefault(error, 'addon.messages.errorwhileretrievingcontacts', true);
        }
    }

    /**
     * Refresh data.
     *
     * @param refresher Refresher.
     */
    async refreshData(refresher?: IonRefresher): Promise<void> {
        try {
            await this.contactsManager.getSource().invalidateCache();

            await this.contactsManager.reload();
        } catch (error) {
            CoreDomUtils.showErrorModalDefault(error, 'addon.messages.errorwhileretrievingcontacts', true);
        } finally {
            refresher?.complete();
        }
    }

    /**
     * Refresh contacts.
     */
    async refreshContacts(): Promise<void> {
        if (this.contactsManager.selectedListType === AddonMessagesContactsListTypes.CONTACTS) {
            await this.refreshData();

            return;
        }

        // Not current list, just reset it so it's reloaded the next time.
        if (this.contactsManager.contactsLoaded) {
            await this.contactsManager.contactsSource.invalidateCache();
            this.contactsManager.contactsSource.reset();
        }
    }

    /**
     * Refresh contacts.
     */
    async refreshRequests(): Promise<void> {
        if (this.contactsManager.selectedListType === AddonMessagesContactsListTypes.REQUESTS) {
            await this.refreshData();

            return;
        }

        // Not current list, just reset it so it's reloaded the next time.
        if (this.contactsManager.requestsLoaded) {
            await this.contactsManager.requestsSource.invalidateCache();
            this.contactsManager.requestsSource.reset();
        }
    }

    /**
     * Load more data.
     *
     * @param infiniteComplete Infinite scroll complete function. Only used from core-infinite-loading.
     * @returns Resolved when done.
     */
    async loadMoreData(infiniteComplete?: () => void): Promise<void> {
        try {
            await this.fetchData();
        } finally {
            infiniteComplete && infiniteComplete();
        }
    }

    /**
     * Navigate to the search page.
     */
    gotoSearch(): void {
        CoreNavigator.navigateToSitePath('search');
    }

    /**
     * Select a tab.
     *
     * @param selected Tab to select.
     */
    selectTab(selected: string): void {
        if (selected !== AddonMessagesContactsListTypes.CONTACTS && selected !== AddonMessagesContactsListTypes.REQUESTS) {
            return;
        }

        this.contactsManager.setSelectedListType(selected);
    }

    /**
     * Page destroyed.
     */
    ngOnDestroy(): void {
        this.contactRequestsCountObserver?.off();
    }

}

/**
 * Contacts and requests manager.
 */
class AddonMessagesContactsManager
    extends CoreListItemsManager<
    AddonMessagesConversationMember,
    AddonMessagesContactsSource | AddonMessagesContactRequestsSource
    > {

    selectedListType: AddonMessagesContactsListTypes = AddonMessagesContactsListTypes.CONTACTS;

    protected requestsUnsubscribe: () => void;

    constructor(
        public contactsSource: AddonMessagesContactsSource,
        pageRouteLocator: unknown | ActivatedRoute,
        public requestsSource: AddonMessagesContactRequestsSource,
    ) {
        super(contactsSource, pageRouteLocator);

        this.requestsUnsubscribe = requestsSource.addListener({
            onItemsUpdated: () => this.onSourceItemsUpdated(),
            onReset: () => this.onSourceReset(),
        });
    }

    /**
     * Get source.
     *
     * @returns Source.
     */
    getSource(): AddonMessagesContactsSource | AddonMessagesContactRequestsSource {
        return this.selectedListType === AddonMessagesContactsListTypes.CONTACTS ? this.contactsSource : this.requestsSource;
    }

    get contacts(): AddonMessagesConversationMember[] {
        return this.contactsSource.getItems() ?? [];
    }

    get contactsLoaded(): boolean {
        return this.contactsSource.getItems() !== null;
    }

    get contactsCompleted(): boolean {
        return this.contactsSource.isCompleted();
    }

    get contactsEmpty(): boolean {
        return this.contacts.length === 0;
    }

    get contactsFetchFailed(): boolean {
        return this.contactsSource.fetchFailed;
    }

    get requests(): AddonMessagesConversationMember[] {
        return this.requestsSource.getItems() ?? [];
    }

    get requestsLoaded(): boolean {
        return this.requestsSource.getItems() !== null;
    }

    get requestsCompleted(): boolean {
        return this.requestsSource.isCompleted();
    }

    get requestsEmpty(): boolean {
        return this.requests.length === 0;
    }

    get requestsFetchFailed(): boolean {
        return this.requestsSource.fetchFailed;
    }

    /**
     * Change selected list type.
     *
     * @param newValue Value to set.
     */
    setSelectedListType(newValue: AddonMessagesContactsListTypes): void {
        if (this.selectedListType === newValue) {
            return;
        }

        this.selectedListType = newValue;

        if (
            (this.selectedListType === AddonMessagesContactsListTypes.CONTACTS && !this.contactsLoaded) ||
            (this.selectedListType === AddonMessagesContactsListTypes.REQUESTS && !this.requestsLoaded)
        ) {
            this.load();
        }
    }

    /**
     * Invalidate cache.
     *
     * @param allLists True to invalidate all lists, false to invalidate active one.
     */
    async invalidateCache(allLists = false): Promise<void> {
        const promises: Promise<unknown>[] = [];

        if (allLists || this.selectedListType === AddonMessagesContactsListTypes.CONTACTS) {
            promises.push(AddonMessages.invalidateUserContacts());
        }

        if (allLists || this.selectedListType === AddonMessagesContactsListTypes.REQUESTS) {
            promises.push(AddonMessages.invalidateContactRequestsCache());
        }

        await Promise.all(promises);
    }

    /**
     * @inheritdoc
     */
    protected onSourceItemsUpdated(): void {
        super.onSourceItemsUpdated(this.contacts.concat(this.requests));
    }

    /**
     * @inheritdoc
     */
    protected onSourceReset(): void {
        if (!this.contactsLoaded && !this.requestsLoaded) {
            // Both sources are resetted.
            return super.onSourceReset();
        }

        // One of the sources still has items, don't reset the manager.
        this.onSourceItemsUpdated();
        if (this.getSource().getItems() === null) {
            this.selectedItem = null;
        }
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        super.destroy();

        this.setSource(null);
    }

}

export enum AddonMessagesContactsListTypes {
    CONTACTS = 'contacts',
    REQUESTS = 'requests',
}
