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

import { APP_INITIALIZER, Provider } from '@angular/core';
import { CoreApp } from '@services/app';
import { CoreConfig } from '@services/config';
import { CoreCronDelegate } from '@services/cron';
import { CoreFilepool } from '@services/filepool';
import { CoreLang } from '@services/lang';
import { CoreLocalNotifications } from '@services/local-notifications';
import { CoreNetwork } from '@services/network';
import { CorePlatform } from '@services/platform';
import { CoreScreen } from '@services/screen';
import { CoreSites } from '@services/sites';
import { CoreUpdateManager } from '@services/update-manager';
import { CoreCustomURLSchemes } from '@services/urlschemes';
import { CoreTimeUtils } from '@services/utils/time';
import { NgZone } from '@singletons';
import { CoreEvents } from '@singletons/events';

/**
 *
 */
export function getInitializerProviders(): Provider[] {
    // @todo: require.context is undefined. For now I just replicated the most important initializers directly.
    return [
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                await CoreUpdateManager.donePromise;

                CoreApp.consumeStorageRedirect();
            },
            multi: true,
        },
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                await Promise.all([
                    CoreApp.initializeDatabase(),
                    CoreConfig.initializeDatabase(),
                    CoreCronDelegate.initializeDatabase(),
                    CoreFilepool.initializeDatabase(),
                    CoreLocalNotifications.initializeDatabase(),
                    CoreSites.initializeDatabase(),
                ]);
            },
            multi: true,
        },
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                await Promise.all([
                    CoreConfig.initialize(),
                    CoreFilepool.initialize(),
                    CoreSites.initialize(),
                    CoreLang.initialize(),
                    CoreLocalNotifications.initialize(),
                    CoreNetwork.initialize(),
                    CoreUpdateManager.initialize(),
                    CoreTimeUtils.initialize(),
                ]);
            },
            multi: true,
        },
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                const lastUrls: Record<string, number> = {};

                // Handle app launched with a certain URL (custom URL scheme).
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (<any> window).handleOpenURL = (url: string): void => {
                    // Execute the callback in the Angular zone, so change detection doesn't stop working.
                    NgZone.run(() => {
                        // First check that the URL hasn't been treated a few seconds ago. Sometimes this function is called more than once.
                        if (lastUrls[url] && Date.now() - lastUrls[url] < 3000) {
                            // Function called more than once, stop.
                            return;
                        }

                        if (!CoreCustomURLSchemes.isCustomURL(url)) {
                            // Not a custom URL, ignore.
                            return;
                        }

                        lastUrls[url] = Date.now();

                        CoreEvents.trigger(CoreEvents.APP_LAUNCHED_URL, { url });
                        CoreCustomURLSchemes.handleCustomURL(url).catch((error) => {
                            CoreCustomURLSchemes.treatHandleCustomURLError(error);
                        });
                    });
                };
            },
            multi: true,
        },
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                await CorePlatform.ready();

                if (!window.cordova?.InAppBrowser) {
                    return;
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (<any> window).open = window.cordova.InAppBrowser.open;
            },
            multi: true,
        },
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                await CoreUpdateManager.donePromise;

                await CoreSites.restoreSession();
            },
            multi: true,
        },
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                await CorePlatform.ready();
            },
            multi: true,
        },
        {
            provide: APP_INITIALIZER,
            useValue: async () => {
                CoreScreen.watchViewport();

                CoreScreen.watchOrientation();
            },
            multi: true,
        },
    ];
    // const context = require.context('./', false, /\.ts$/);

    // return context.keys().reduce((providers, fileName) => {
    //     const name = (fileName.match(/^(?:\.\/)?(.+)\.ts$/) || [])[1];

    //     if (name !== undefined && name !== 'index') {
    //         providers.push({
    //             provide: APP_INITIALIZER,
    //             useValue: context(fileName).default,
    //             multi: true,
    //         });
    //     }

    //     return providers;
    // }, [] as Provider[]);
}
