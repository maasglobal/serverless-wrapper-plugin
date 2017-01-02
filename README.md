Serverless Wrapper Plugin
------------------------------------------------------------------------
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

This goal of this plugin is to provide an easy way to wrap your serverless functions with a wrapper function, without
having to edit all the functions themselves.

One use case for this is for example, if you want to override ```console.warn``` to prepend a custom string, to make these warning easier to trace in the logs. You could add this to the begining of every handler in your project, or you could write one wrapper function to perform this override and use the ```serverless-wrapper-plugin``` to automatically wrap all your handlers.

Another use case might be, you want to write a process to periodically make requests to your functions to keep them hot. You hadn't planned for this when you wrote all your handlers, so what input do you send to avoid causing either errors or unwanted side-effects? With the ```serverless-wrapper-plugin``` you could write a wrapper to intercept the input event, and if it is the dummy "wake up" event, then ignore it and return. If it isn't the dummy event then simply pass it through to the handler as normal.

**UPDATE 1.1.0**
- Support function specific wrapper function, using `wrapperPath` option, set using relative wrapper path to `s-function.json` file.
- Support skipping wrapper if `wrapperPath` is set to `false`


## Setup
> Not compatible with Serverless 1.0.0 and above

> NOTE: If you are using the ```serverless-webpack-plugin```, this plugin must be before the webpack plugin in the list.

### Wrapper Function
Firstly you need to write the wrapper function that you want to apply.
This wrapper function should have the following form:

```{js}
function myWrapper(handler, event, context) {
    // Do whatever you like here..
    // ...

    // Call the original handler
    return handler(event, context);
}

module.exports = myWrapper;
```

The way that this is used is that the handler is transformed to be something like this:

```{js}
const _handler = require('...path to original handler...');
const _wrapper = require('...path to myWrapper...');

module.exports.handler = function (event, context) {
    return _wrapper(_handler, event, context);
}
```

### Plugin Installation
* Install the plugin in the root of your Serverless Project:
```{bash}
npm install serverless-wrapper-plugin --save-dev
```

* Add the plugin to the `plugins` array in your Serverless Project's `s-project.json`, as below.

> NOTE: If you are using the ```serverless-webpack-plugin```, this plugin must be before the webpack plugin in the list.

```{json}
"plugins": [
    "serverless-wrapper-plugin"
]
```

* In the `custom` property of either your `s-project.json` or `s-function.json` add a default wrapper property. The path is relative to the project root. This is a fallback support if your s-function does not contains a `wrapperPath` property.

```{js}
{
    ...
    "custom": {
        "wrapper": {
            "path": "path/relative/to/project-root"
        }
    }
    ...
}
```

* To set a custom wrapper for specific function, add wrapper's relative path to `s-function.json` of the function. If you do not want your function to be wrapped in any of the wrapper, turn wrapper function to **false**
```{js}
  ...
  "name": "your-function",
  "runtime": "nodejs4.3",
  "wrapperPath": "wrapper.js",
  "handler": "handler.handler",
  ...
  ...
  "name": "your-function",
  "runtime": "nodejs4.3",
  "wrapperPath": false,
  "handler": "handler.handler",
  ...
```

## Development

A brief note about development of the plugin itself. Part of the function of this plugin is to generate code. To do this it uses the template engine [doT.js](http://olado.github.io/doT/index.html).

There is a template in ```lib/wrapped-handler.jst``` this is pre-compiled for runtime efficiency and saved as ```lib/wrapped-handler.js```.

To re-compiled this template, you can use the convenience script in ```bin/compile-template.js```
