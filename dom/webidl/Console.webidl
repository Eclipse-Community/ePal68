/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * For more information on this interface, please see
 * https://console.spec.whatwg.org/#console-namespace
 */

[Exposed=(Window,Worker,WorkerDebugger,Worklet),
 ClassString="Console",
 ProtoObjectHack]
namespace console {

  // NOTE: if you touch this namespace, remember to update the ConsoleInstance
  // interface as well!

  // Logging
  void assert(optional boolean condition = false, any... data);
  void clear();
  void count(optional DOMString label = "default");
  void countReset(optional DOMString label = "default");
  void debug(any... data);
  void error(any... data);
  void info(any... data);
  void log(any... data);
  void table(any... data); // FIXME: The spec is still unclear about this.
  void trace(any... data);
  void warn(any... data);
  void dir(any... data); // FIXME: This doesn't follow the spec yet.
  void dirxml(any... data);

  // Grouping
  void group(any... data);
  void groupCollapsed(any... data);
  void groupEnd();

  // Timing
  void time(optional DOMString label = "default");
  void timeLog(optional DOMString label = "default", any... data);
  void timeEnd(optional DOMString label = "default");

  // Mozilla only or Webcompat methods

  void _exception(any... data);
  void timeStamp(optional any data);

  void profile(any... data);
  void profileEnd(any... data);

  [ChromeOnly]
  const boolean IS_NATIVE_CONSOLE = true;

  [ChromeOnly, NewObject]
  ConsoleInstance createInstance(optional ConsoleInstanceOptions options = {});
};

// This is used to propagate console events to the observers.
[GenerateConversionToJS]
dictionary ConsoleEvent {
  (unsigned long long or DOMString) ID;
  (unsigned long long or DOMString) innerID;
  DOMString consoleID = "";
  DOMString addonId = "";
  DOMString level = "";
  DOMString filename = "";
  // Unique identifier within the process for the script source this event is
  // associated with, or zero.
  unsigned long sourceId = 0;
  unsigned long lineNumber = 0;
  unsigned long columnNumber = 0;
  DOMString functionName = "";
  double timeStamp = 0;
  sequence<any> arguments;
  sequence<DOMString?> styles;
  boolean private = false;
  // stacktrace is handled via a getter in some cases so we can construct it
  // lazily.  Note that we're not making this whole thing an interface because
  // consumers expect to see own properties on it, which would mean making the
  // props unforgeable, which means lots of JSFunction allocations.  Maybe we
  // should fix those consumers, of course....
  // sequence<ConsoleStackEntry> stacktrace;
  DOMString groupName = "";
  any timer = null;
  any counter = null;
  DOMString prefix = "";
  boolean chromeContext = false;
};

// Event for profile operations
[GenerateConversionToJS]
dictionary ConsoleProfileEvent {
  DOMString action = "";
  sequence<any> arguments;
  boolean chromeContext = false;
};

// This dictionary is used to manage stack trace data.
[GenerateConversionToJS]
dictionary ConsoleStackEntry {
  DOMString filename = "";
  // Unique identifier within the process for the script source this entry is
  // associated with, or zero.
  unsigned long sourceId = 0;
  unsigned long lineNumber = 0;
  unsigned long columnNumber = 0;
  DOMString functionName = "";
  DOMString? asyncCause;
};

[GenerateConversionToJS]
dictionary ConsoleTimerStart {
  DOMString name = "";
};

[GenerateConversionToJS]
dictionary ConsoleTimerLogOrEnd {
  DOMString name = "";
  double duration = 0;
};

[GenerateConversionToJS]
dictionary ConsoleTimerError {
  DOMString error = "";
  DOMString name = "";
};

[GenerateConversionToJS]
dictionary ConsoleCounter {
  DOMString label = "";
  unsigned long count = 0;
};

[GenerateConversionToJS]
dictionary ConsoleCounterError {
  DOMString label = "";
  DOMString error = "";
};

[ChromeOnly,
 Exposed=(Window,Worker,WorkerDebugger,Worklet)]
// This is basically a copy of the console namespace.
interface ConsoleInstance {
  // Logging
  void assert(optional boolean condition = false, any... data);
  void clear();
  void count(optional DOMString label = "default");
  void countReset(optional DOMString label = "default");
  void debug(any... data);
  void error(any... data);
  void info(any... data);
  void log(any... data);
  void table(any... data); // FIXME: The spec is still unclear about this.
  void trace(any... data);
  void warn(any... data);
  void dir(any... data); // FIXME: This doesn't follow the spec yet.
  void dirxml(any... data);

  // Grouping
  void group(any... data);
  void groupCollapsed(any... data);
  void groupEnd();

  // Timing
  void time(optional DOMString label = "default");
  void timeLog(optional DOMString label = "default", any... data);
  void timeEnd(optional DOMString label = "default");

  // Mozilla only or Webcompat methods

  void _exception(any... data);
  void timeStamp(optional any data);

  void profile(any... data);
  void profileEnd(any... data);
};

callback ConsoleInstanceDumpCallback = void (DOMString message);

enum ConsoleLogLevel {
  "All", "Debug", "Log", "Info", "Clear", "Trace", "TimeLog", "TimeEnd", "Time",
  "Group", "GroupEnd", "Profile", "ProfileEnd", "Dir", "Dirxml", "Warn", "Error",
  "Off"
};

dictionary ConsoleInstanceOptions {
  // An optional function to intercept all strings written to stdout.
  ConsoleInstanceDumpCallback dump;

  // An optional prefix string to be printed before the actual logged message.
  DOMString prefix = "";

  // An ID representing the source of the message. Normally the inner ID of a
  // DOM window.
  DOMString innerID = "";

  // String identified for the console, this will be passed through the console
  // notifications.
  DOMString consoleID = "";

  // Identifier that allows to filter which messages are logged based on their
  // log level.
  ConsoleLogLevel maxLogLevel;

  // String pref name which contains the level to use for maxLogLevel. If the
  // pref doesn't exist, gets removed or it is used in workers, the maxLogLevel
  // will default to the value passed to this constructor (or "all" if it wasn't
  // specified).
  DOMString maxLogLevelPref = "";
};

enum ConsoleLevel { "log", "warning", "error" };

// this interface is just for testing
partial interface ConsoleInstance {
  [ChromeOnly]
  void reportForServiceWorkerScope(DOMString scope, DOMString message,
                                   DOMString filename, unsigned long lineNumber,
                                   unsigned long columnNumber,
                                   ConsoleLevel level);
};
