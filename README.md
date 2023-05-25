Moodle App Ionic 7 POC
=================

This is a Proof of Concept to update the Moodle app to Ionic 7. Some of the issues detected were just "avoided" instead of properly fixed to try to have the app running as fast as possible.

**This POC is not running properly.**

Here are the main problems found:

* ionic/native doesn't work with Ionic 7, you need to use awesome-cordova-plugins instead. But this repository doesn't have the qrscanner plugin because it's no longer maintained. In this POC, the references to qrscanner plugin were removed.
* IonSlides no longer exist, now you need to use the Slider library directly. In this POC, the references to IonSlides were removed.
* ion-datetime inputs have changed. In this POC, the inputs that failed were removed.
* VSCode marks a lot of imports as unused, but they are used. E.g. decorators. Also, the indentation is detected wrong (maybe they are related issues).
* RXJS toPromise changed signature and is deprecated, you need to use firstValueFrom instead.
* Chooser.getFileMetadata doesn't exist anymore, use Chooser.getFile instead.
* ApplicationInitStatus no longer accepts injected value in constructor. In this POC the parameter was removed, and I'm not sure if this can cause any side effect.
* AngularDelegate.create now requires EnvironmentInjector, not ComponentFactoryResolver.
* Conflict in types from cordova-plugin-file and TypeScript. To compile, temporarily modify the types in cordova-plugin-file to make them match the TS ones:
```
    interface FileSystem {
        /* The name of the file system, unique across the list of exposed file systems. */
        readonly name: string;
        /** The root directory of the file system. */
        readonly root: FileSystemDirectoryEntry;
    }
```
* Import ~theme didn't work. In this POC, it was changed to relative paths instead of looking for the proper solution.
* A lot of imports using aliases didn't work. To fix them, in tsconfig the path "@/\*" was changed from "\*" to "./\*".
* !raw-loader! import didn't work. In this POC it was just removed.
* There were a bunch of TypeScript errors. Most of them were about comparing string with numbers when using "<" or ">", and with routes that used functions returning Promise<unknown>.
* The app crashed on start up with the error "require.context is not a function". This is caused by initializers index. In this POC, some of the initializers were just replicated in the index file instead of importing them dynamically.
* debugger statements are removed when building, which makes it more difficult to debug issues. Maybe there is a webpack option to keep them, but I didn't find it.
* App freezes on main menu. This is because of circular routes, and it didn't happen in Angular 10. In the last commit I tried to fix it (by avoiding a route to be a child/sibling of itself), but it also happens for example if you have routes A and B and you put B as child of A and A as child of B.
