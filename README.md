# companion-module-rigflux-pulse

A [Bitfocus Companion](https://bitfocus.io/companion) module for the RigFlux Pulse media server.

Needs Companion 4.3 or later (`@companion-module/base` 2.x). See [HELP.md](./companion/HELP.md) for setting it up and what it does.

## Development

```sh
yarn install
yarn test       # the client against a fake engine
yarn typecheck  # the definitions against the module API's types
yarn package    # builds the .tgz Companion loads
```

To try it in Companion, point Companion's developer modules folder at the folder that holds this one.
