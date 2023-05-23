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

import { CoreSiteSchema } from '@services/sites';

/**
 * Database variables for CoreRemindersService service.
 */
export const REMINDERS_TABLE = 'core_reminders';
export const REMINDERS_SITE_SCHEMA: CoreSiteSchema = {
    name: 'CoreRemindersService',
    version: 1,
    canBeCleared: [],
    tables: [
        {
            name: REMINDERS_TABLE,
            columns: [
                {
                    name: 'id',
                    type: 'INTEGER',
                    primaryKey: true,
                },
                {
                    name: 'component',
                    type: 'TEXT',
                    notNull: true,
                },
                {
                    name: 'instanceId',
                    type: 'INTEGER',
                    notNull: true,
                },
                {
                    name: 'type',
                    type: 'TEXT',
                    notNull: true,
                },
                {
                    name: 'time',
                    type: 'INTEGER',
                    notNull: true,
                },
                {
                    name: 'timebefore',
                    type: 'INTEGER',
                    notNull: true,
                },
                {
                    name: 'title',
                    type: 'TEXT',
                    notNull: true,
                },
                {
                    name: 'url',
                    type: 'TEXT',
                },

            ],
            uniqueKeys: [
                ['component', 'instanceId', 'timebefore'],
            ],
        },
    ],
};

export type CoreReminderDBRecord = {
    id: number; // Reminder ID.
    component: string; // Component where the reminder belongs.
    instanceId: number; // Instance Id where the reminder belongs.
    type: string; // Event idenfier type.
    time: number; // Event time.
    timebefore: number; // Seconds before the event to remind.
    title: string; // Notification title.
    url?: string; // URL where to redirect the user.
};
