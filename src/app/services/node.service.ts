import { Injectable } from '@angular/core';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class NodeService {

  errorMsg = 'Node error - offline';
  successMsg = 'Successfully connected to the node.';

  status:boolean = null; // null - loading, false - offline, true - online
  synchronized:boolean = null; // null - loading, false - not synchronized, true - synchronized
  synchronizedTransactions:boolean = null; // null - loading, false - not synchronized, true - synchronized
  synchronizedPov:boolean = null; // null - loading, false - not synchronized, true - synchronized
  break:boolean = null; // null - loading, false - node ok, true - old version, don't process
  running:boolean = false; // local node status, false - not running, true - running
  
  constructor(private notifications: NotificationService) {
    this.notifications.sendInfo('Connecting to the node. Please wait.', { identifier: 'node-connect', length: 0 })
   }


  setOffline(message = this.errorMsg) {
    if (this.status === false || this.status === null) {
      return; // Already offline
    }
    
    this.status = false;
    this.synchronized = null;
    this.synchronizedTransactions = null;
    this.synchronizedPov = null;
    const errMessage = message;
    this.notifications.removeNotification('node-syncing');
    this.notifications.sendError(errMessage, { identifier: 'node-offline', length: 0 });
  }

  setOnline() {
    if (this.status) {
      return; // Already online
    }

    this.status = true;
    this.notifications.removeNotification('node-offline');
    this.notifications.removeNotification('node-connect');
    this.notifications.sendSuccess(this.successMsg, { identifier: 'node-connected', length: 2000 });
  }

  setSynchronizing() {
    if (this.synchronized === null || this.synchronized === true) {
      this.notifications.sendInfo('Node is synchronizing. Please wait.', { identifier: 'node-syncing', length: 0 });
      this.synchronized = false;
    }
  }

  setSynchronizingTransactions() {
    if (this.synchronizedTransactions === null || this.synchronizedTransactions === true) {
      this.synchronizedTransactions = false;
      this.setSynchronizing();
    }
  }

  setSynchronizingPov() {
    if (this.synchronizedPov === null || this.synchronizedPov === true) {
      this.synchronizedPov = false;
      this.setSynchronizing();
    }
  }

  setSynchronized() {
    if (this.synchronized === false && this.synchronizedPov === true && this.synchronizedTransactions === true) {
      this.notifications.removeNotification('node-syncing');
      this.notifications.sendSuccess('Node synchronized.', { identifier: 'node-synced', length: 2000 });
      this.synchronized = true;
    }
  }

  setSynchronizedTransactions() {
    if (this.synchronizedTransactions === false || this.synchronizedTransactions === null) {
      this.synchronizedTransactions = true;
      this.setSynchronized();
    }
  }

  setSynchronizedPov() {
    if (this.synchronizedPov === false || this.synchronizedPov === null) {
      this.synchronizedPov = true;
      this.setSynchronized();
    }
  }

}
