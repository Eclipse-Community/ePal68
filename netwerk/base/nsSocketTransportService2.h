/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsSocketTransportService2_h__
#define nsSocketTransportService2_h__

#include "PollableEvent.h"
#include "mozilla/Atomics.h"
#include "mozilla/LinkedList.h"
#include "mozilla/Logging.h"
#include "mozilla/Maybe.h"
#include "mozilla/Mutex.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/net/DashboardTypes.h"
#include "nsCOMPtr.h"
#include "nsIDirectTaskDispatcher.h"
#include "nsIObserver.h"
#include "nsIRunnable.h"
#include "nsIThreadInternal.h"
#include "nsITimer.h"
#include "nsPISocketTransportService.h"
#include "prinit.h"
#include "prinrval.h"

class nsASocketHandler;
struct PRPollDesc;
class nsIPrefBranch;

//-----------------------------------------------------------------------------

namespace mozilla {
namespace net {

//
// set MOZ_LOG=nsSocketTransport:5
//
extern LazyLogModule gSocketTransportLog;
#define SOCKET_LOG(args) MOZ_LOG(gSocketTransportLog, LogLevel::Debug, args)
#define SOCKET_LOG1(args) MOZ_LOG(gSocketTransportLog, LogLevel::Error, args)
#define SOCKET_LOG_ENABLED() MOZ_LOG_TEST(gSocketTransportLog, LogLevel::Debug)

//
// set MOZ_LOG=UDPSocket:5
//
extern LazyLogModule gUDPSocketLog;
#define UDPSOCKET_LOG(args) MOZ_LOG(gUDPSocketLog, LogLevel::Debug, args)
#define UDPSOCKET_LOG_ENABLED() MOZ_LOG_TEST(gUDPSocketLog, LogLevel::Debug)

//-----------------------------------------------------------------------------

#define NS_SOCKET_POLL_TIMEOUT PR_INTERVAL_NO_TIMEOUT

//-----------------------------------------------------------------------------

// These maximums are borrowed from the linux kernel.
static const int32_t kMaxTCPKeepIdle = 32767;  // ~9 hours.
static const int32_t kMaxTCPKeepIntvl = 32767;
static const int32_t kMaxTCPKeepCount = 127;
static const int32_t kDefaultTCPKeepCount =
#if defined(XP_WIN)
    10;  // Hardcoded in Windows.
#elif defined(XP_MACOSX)
    8;  // Hardcoded in OSX.
#else
    4;  // Specifiable in Linux.
#endif

class LinkedRunnableEvent final
    : public LinkedListElement<LinkedRunnableEvent> {
 public:
  explicit LinkedRunnableEvent(nsIRunnable* event) : mEvent(event) {}
  ~LinkedRunnableEvent() = default;

  already_AddRefed<nsIRunnable> TakeEvent() { return mEvent.forget(); }

 private:
  nsCOMPtr<nsIRunnable> mEvent;
};

//-----------------------------------------------------------------------------

class nsSocketTransportService final : public nsPISocketTransportService,
                                       public nsISerialEventTarget,
                                       public nsIThreadObserver,
                                       public nsIRunnable,
                                       public nsIObserver,
                                       public nsIDirectTaskDispatcher {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSPISOCKETTRANSPORTSERVICE
  NS_DECL_NSISOCKETTRANSPORTSERVICE
  NS_DECL_NSIROUTEDSOCKETTRANSPORTSERVICE
  NS_DECL_NSIEVENTTARGET_FULL
  NS_DECL_NSITHREADOBSERVER
  NS_DECL_NSIRUNNABLE
  NS_DECL_NSIOBSERVER
  NS_DECL_NSIDIRECTTASKDISPATCHER

  nsSocketTransportService();

  // Max Socket count may need to get initialized/used by nsHttpHandler
  // before this class is initialized.
  static uint32_t gMaxCount;
  static PRCallOnceType gMaxCountInitOnce;
  static PRStatus DiscoverMaxCount();

  bool CanAttachSocket();

  // Called by the networking dashboard on the socket thread only
  // Fills the passed array with socket information
  void GetSocketConnections(nsTArray<SocketInfo>*);
  uint64_t GetSentBytes() { return mSentBytesCount; }
  uint64_t GetReceivedBytes() { return mReceivedBytesCount; }

  // Returns true if keepalives are enabled in prefs.
  bool IsKeepaliveEnabled() { return mKeepaliveEnabledPref; }

  bool IsTelemetryEnabledAndNotSleepPhase();
  PRIntervalTime MaxTimeForPrClosePref() { return mMaxTimeForPrClosePref; }

  bool IsEsniEnabled() {
    return mEsniEnabled && !mTrustedMitmDetected && !mNotTrustedMitmDetected;
  }

  void SetNotTrustedMitmDetected() { mNotTrustedMitmDetected = true; }

 protected:
  virtual ~nsSocketTransportService();

 private:
  //-------------------------------------------------------------------------
  // misc (any thread)
  //-------------------------------------------------------------------------

  // The value is guaranteed to be valid and not dangling while on the socket
  // thread as mThread is only ever reset after it's been shutdown.
  // This member should only ever be read on the socket thread.
  nsIThread* mRawThread;

  // Returns mThread in a thread-safe manner.
  already_AddRefed<nsIThread> GetThreadSafely();
  // Same as above, but return mThread as a nsIDirectTaskDispatcher
  already_AddRefed<nsIDirectTaskDispatcher> GetDirectTaskDispatcherSafely();

  //-------------------------------------------------------------------------
  // initialization and shutdown (any thread)
  //-------------------------------------------------------------------------

  Atomic<bool> mInitialized;
  // indicates whether we are currently in the process of shutting down
  Atomic<bool> mShuttingDown;
  Mutex mLock;
  // Variables in the next section protected by mLock

  // mThread and mDirectTaskDispatcher are only ever modified on the main
  // thread. Will be set on Init and set to null after shutdown. You must access
  // mThread and mDirectTaskDispatcher outside the main thread via respectively
  // GetThreadSafely and GetDirectTaskDispatchedSafely().
  nsCOMPtr<nsIThread> mThread;
  // We store a pointer to mThread as a direct task dispatcher to avoid having
  // to do do_QueryInterface whenever we need to access the interface.
  nsCOMPtr<nsIDirectTaskDispatcher> mDirectTaskDispatcher;
  UniquePtr<PollableEvent> mPollableEvent;
  bool mOffline;
  bool mGoingOffline;

  // Detaches all sockets.
  void Reset(bool aGuardLocals);

  nsresult ShutdownThread();

  //-------------------------------------------------------------------------
  // socket lists (socket thread only)
  //
  // only "active" sockets are on the poll list.  the active list is kept
  // in sync with the poll list such that:
  //
  //   mActiveList[k].mFD == mPollList[k+1].fd
  //
  // where k=0,1,2,...
  //-------------------------------------------------------------------------

  struct SocketContext {
    PRFileDesc* mFD;
    nsASocketHandler* mHandler;
    PRIntervalTime mPollStartEpoch;  // time we started to poll this socket

   public:
    // Returns true iff the socket has not been signalled longer than
    // the desired timeout (mHandler->mPollTimeout).
    bool IsTimedOut(PRIntervalTime now) const;
    // Engages the timeout by marking the epoch we start polling this socket.
    // If epoch is already marked this does nothing, hence, this method can be
    // called everytime we put this socket to poll() list with in-flags set.
    void EnsureTimeout(PRIntervalTime now);
    // Called after an event on a socket has been signalled to turn of the
    // timeout calculation.
    void DisengageTimeout();
    // Returns the number of intervals this socket is about to timeout in,
    // or 0 (zero) when it has already timed out.  Returns
    // NS_SOCKET_POLL_TIMEOUT when there is no timeout set on the socket.
    PRIntervalTime TimeoutIn(PRIntervalTime now) const;
    // When a socket timeout is reset and later set again, it may happen
    // that mPollStartEpoch is not reset in between.  We have to manually
    // call this on every iteration over sockets to ensure the epoch reset.
    void MaybeResetEpoch();
  };

  SocketContext* mActiveList; /* mListSize entries */
  SocketContext* mIdleList;   /* mListSize entries */

  uint32_t mActiveListSize;
  uint32_t mIdleListSize;
  uint32_t mActiveCount;
  uint32_t mIdleCount;

  nsresult DetachSocket(SocketContext*, SocketContext*);
  nsresult AddToIdleList(SocketContext*);
  nsresult AddToPollList(SocketContext*);
  void RemoveFromIdleList(SocketContext*);
  void RemoveFromPollList(SocketContext*);
  void MoveToIdleList(SocketContext* sock);
  void MoveToPollList(SocketContext* sock);

  bool GrowActiveList();
  bool GrowIdleList();
  void InitMaxCount();

  // Total bytes number transfered through all the sockets except active ones
  uint64_t mSentBytesCount;
  uint64_t mReceivedBytesCount;
  //-------------------------------------------------------------------------
  // poll list (socket thread only)
  //
  // first element of the poll list is mPollableEvent (or null if the pollable
  // event cannot be created).
  //-------------------------------------------------------------------------

  PRPollDesc* mPollList; /* mListSize + 1 entries */

  PRIntervalTime PollTimeout(
      PRIntervalTime now);  // computes ideal poll timeout
  nsresult DoPollIteration(TimeDuration* pollDuration);
  // perfoms a single poll iteration
  int32_t Poll(TimeDuration* pollDuration, PRIntervalTime now);
  // calls PR_Poll.  the out param
  // interval indicates the poll
  // duration in seconds.
  // pollDuration is used only for
  // telemetry

  //-------------------------------------------------------------------------
  // pending socket queue - see NotifyWhenCanAttachSocket
  //-------------------------------------------------------------------------
  AutoCleanLinkedList<LinkedRunnableEvent> mPendingSocketQueue;

  // Preference Monitor for SendBufferSize and Keepalive prefs.
  nsresult UpdatePrefs();
  static void UpdatePrefs(const char* aPref, void* aSelf);
  void UpdateSendBufferPref();
  int32_t mSendBufferSize;
  // Number of seconds of connection is idle before first keepalive ping.
  int32_t mKeepaliveIdleTimeS;
  // Number of seconds between retries should keepalive pings fail.
  int32_t mKeepaliveRetryIntervalS;
  // Number of keepalive probes to send.
  int32_t mKeepaliveProbeCount;
  // True if TCP keepalive is enabled globally.
  bool mKeepaliveEnabledPref;
  // Timeout of pollable event signalling.
  TimeDuration mPollableEventTimeout;

  Atomic<bool> mServingPendingQueue;
  Atomic<int32_t, Relaxed> mMaxTimePerPollIter;
  Atomic<PRIntervalTime, Relaxed> mMaxTimeForPrClosePref;
  // Timestamp of the last network link change event, tracked
  // also on child processes.
  Atomic<PRIntervalTime, Relaxed> mLastNetworkLinkChangeTime;
  // Preference for how long we do busy wait after network link
  // change has been detected.
  Atomic<PRIntervalTime, Relaxed> mNetworkLinkChangeBusyWaitPeriod;
  // Preference for the value of timeout for poll() we use during
  // the network link change event period.
  Atomic<PRIntervalTime, Relaxed> mNetworkLinkChangeBusyWaitTimeout;

  // Between a computer going to sleep and waking up the PR_*** telemetry
  // will be corrupted - so do not record it.
  Atomic<bool, Relaxed> mSleepPhase;
  nsCOMPtr<nsITimer> mAfterWakeUpTimer;

  void OnKeepaliveEnabledPrefChange();
  void NotifyKeepaliveEnabledPrefChange(SocketContext* sock);

  // Socket thread only for dynamically adjusting max socket size
#if defined(XP_WIN)
  void ProbeMaxCount();
#endif
  bool mProbedMaxCount;

  void AnalyzeConnection(nsTArray<SocketInfo>* data, SocketContext* context,
                         bool aActive);

  void ClosePrivateConnections();
  void DetachSocketWithGuard(bool aGuardLocals, SocketContext* socketList,
                             int32_t index);

  void MarkTheLastElementOfPendingQueue();

#if defined(XP_WIN)
  Atomic<bool> mPolling;
  nsCOMPtr<nsITimer> mPollRepairTimer;
  void StartPollWatchdog();
  void DoPollRepair();
  void StartPolling();
  void EndPolling();
#endif

  void TryRepairPollableEvent();

  bool mEsniEnabled;
  bool mTrustedMitmDetected;
  bool mNotTrustedMitmDetected;
};

extern nsSocketTransportService* gSocketTransportService;
bool OnSocketThread();

}  // namespace net
}  // namespace mozilla

#endif  // !nsSocketTransportService_h__
