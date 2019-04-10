/*
 * Copyright 2019 Red Hat Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import React from 'react';
import { Button } from '@patternfly/react-core';
import { Table, TableHeader, TableBody, SortByDirection } from '@patternfly/react-table';
import { UserFriendsIcon, ReplicatorIcon, RegionsIcon } from '@patternfly/react-icons';
import PropTypes from 'prop-types';
import TopicDetailsTable from './detailsTable';
import TopicsToolbar from './topicsToolbar';
import TopicsService from '../../topicsService';
import TopicsEmpty from './topicsEmpty';
import TopicsTableEmpty from './topicsTableEmpty';
import TopicsLoading from './topicsLoading';
import ServerError from './serverError';
import DeleteConfirm from './deleteConfirm';

// refresh rate for getting consumer count
const REFRESH = 5000;

class TopicsTable extends React.Component {
  static propTypes = {
    handleNewNotification: PropTypes.func.isRequired
  };

  constructor(props) {
    super(props);
    this.topics_service = new TopicsService();
    this.state = {
      columns: [
        { title: 'Name', cellFormatters: [this.formatName.bind(this)] },
        { title: 'Partitions', cellFormatters: [this.formatPartition.bind(this)] },
        { title: 'Partition replicas', cellFormatters: [this.formatReplicas.bind(this)] },
        { title: 'Consumers', cellFormatters: [this.formatConsumers.bind(this)] }
      ],
      rows: [],
      totalRows: 1,
      pageNumber: 1,
      rowsPerPage: 5,
      actions: [
        {
          title: 'Delete',
          onClick: this.handleDeleteRow
        }
      ],
      chipGroups: [
        {
          category: 'Current filters',
          chips: []
        }
      ],
      sortBy: {},
      serverError: false,
      firstLoad: true,
      disableDeleteAll: true,
      deleteOpen: false,
      deleteList: []
    };
    this.refreshTopicList();
    this.polling = false;
    this.allRows = [];
  }

  getColumn = col => this.state.columns.findIndex(c => c.title === col);

  refreshTopicList = justCreated => {
    let { serverError } = this.state;
    const firstLoad = false;
    this.topics_service.getTopicList().then(
      topics => {
        serverError = false;
        this.setState({ serverError, firstLoad });
        this.onTopicList(topics, justCreated);
        if (!this.polling) {
          this.polling = true;
          setTimeout(this.updateConsumers, REFRESH);
        }
      },
      e => {
        serverError = true;
        this.setState({ serverError, firstLoad });
        console.log(`topics error is ${e}`);
        setTimeout(this.refreshTopicList, REFRESH);
      }
    );
  };

  updateConsumer = (row, topic) => {
    if (typeof row.parent === 'undefined' && row.cells[this.getColumn('Name')] === topic.name) {
      row.cells[this.getColumn('Operators')] = topic.consumers;
      return true;
    }
    return false;
  };

  // periodically refresh the consumers column
  updateConsumers = () => {
    this.topics_service.getTopicList().then(
      topics => {
        const serverError = false;
        const { rows } = this.state;
        topics.forEach(topic => {
          rows.some(row => this.updateConsumer(row, topic));
          this.allRows.some(row => this.updateConsumer(row, topic));
        });
        // refresh the display of the visible rows
        this.setState({ rows, serverError });
        setTimeout(this.updateConsumers, REFRESH);
      },
      e => {
        // display the server error screen
        const serverError = true;
        // once topics return, start polling again
        const firstLoad = true;
        this.setState({ serverError, firstLoad });
      }
    );
  };

  handleDeleteRow = (event, rowIndex) => {
    const { rows } = this.state;
    const name = rows[rowIndex].cells[0];
    this.setState({ deleteOpen: true, deleteList: [name] });
  };

  doDeleteList = () => {
    const { deleteList } = this.state;
    this.topics_service.deleteTopicList(deleteList).then(() => {
      const message = `Deleted topic${deleteList.length > 1 ? 's' : ''} [${deleteList.join(', ')}]`;
      this.props.handleNewNotification('warning', message);
      this.refreshTopicList();
    });
  };

  partitionClicked(value, xtraInfo) {
    const { rows } = this.state;
    const { rowIndex } = xtraInfo;
    rows[rowIndex].isOpen = !xtraInfo.rowData.isOpen;
    if (rows[rowIndex].isOpen) {
      rows[rowIndex + 1] = {
        parent: rowIndex,
        cells: [<TopicDetailsTable service={this.topics_service} data={xtraInfo.rowData.name.title} />]
      };
    } else {
      rows[rowIndex + 1] = {
        parent: rowIndex,
        cells: [<React.Fragment />]
      };
    }

    this.setState({
      rows
    });
  }

  formatName = (value, _xtraInfo) => value;

  formatReplicas = value => (
    <span className="table-cell-icon">
      <ReplicatorIcon size="md" />
      {value}
    </span>
  );

  formatConsumers = value => (
    <span className="table-cell-icon">
      <UserFriendsIcon size="md" />
      {value}
    </span>
  );

  formatPartition = (value, xtraInfo) => (
    <React.Fragment>
      <Button
        variant="plain"
        aria-label="Show partition information"
        onClick={() => this.partitionClicked(value, xtraInfo)}
        className="partition-icon-button"
      >
        <RegionsIcon size="md" color="#007BBA" />
      </Button>
      <span className="topics-region-value">{value}</span>
    </React.Fragment>
  );

  onSelect = (_event, isSelected, rowId) => {
    let rows;
    if (rowId === -1) {
      rows = this.state.rows.map(oneRow => {
        oneRow.selected = isSelected;
        return oneRow;
      });
    } else {
      rows = [...this.state.rows];
      rows[rowId].selected = isSelected;
    }
    const disableDeleteAll = !rows.some(row => row.selected);
    this.setState({
      rows,
      disableDeleteAll
    });
  };

  sortRows = (rows, direction, first) => {
    const index = this.getColumn('Name');
    if (typeof direction === 'undefined') {
      if (typeof first !== 'undefined') {
        const firstIndex = rows.findIndex(row => row.cells[index] === first);
        if (firstIndex > 0) {
          const tmp = rows[0];
          rows[0] = rows[firstIndex];
          rows[firstIndex] = tmp;
        }
      }
      return rows;
    }
    rows = rows.sort((a, b) => {
      if (a.cells[index] < b.cells[index]) return -1;
      if (a.cells[index] > b.cells[index]) return 1;
      return 0;
    });
    return direction === 'desc' ? rows.reverse() : rows;
  };

  onSort = (_event, index, direction) => {
    if (typeof direction === 'undefined') direction = SortByDirection.asc;
    this.setState(
      {
        sortBy: {
          index,
          direction
        }
      },
      () => this.handleSetPage(1)
    );
  };

  /* topics is an array of these
  {
      "name": "my-topic-2",
      "partitions": [
        { "id": 0, "leader": 1, "replicas": [1, 0, 2], "isr": [1, 0, 2] },
        { "id": 1, "leader": 2, "replicas": [2, 1, 0], "isr": [2, 1, 0] },
        { "id": 2, "leader": 0, "replicas": [0, 2, 1], "isr": [0, 2, 1] }],
      "consumers": 0
    }
  */
  onTopicList(topics, justCreated) {
    const rows = [];
    topics.forEach((topic, i) => {
      // each partition should have the same number of replicas, so just count the 1st
      const replicas = topic.partitions[0].replicas.length;
      rows.push({
        isOpen: false,
        cells: [topic.name, topic.partitions.length, replicas, topic.consumers]
      });
    });
    this.allRows = rows;
    if (typeof justCreated !== 'undefined') {
      const { chipGroups, sortBy } = this.state;
      chipGroups[0].chips = [];
      sortBy.direction = undefined;
      this.setState({ chipGroups, sortBy }, () => this.handleSetPage(1, justCreated));
    } else {
      this.handleSetPage(1);
    }
  }

  handleSetPage = (pageNumber, first) => {
    let rows = this.filter(this.allRows);
    rows = this.sortRows(rows, this.state.sortBy.direction, first);
    const totalRows = rows.length;
    const { rowsPerPage } = this.state;
    const start = (pageNumber - 1) * rowsPerPage;
    const end = Math.min(totalRows, start + rowsPerPage);
    rows = rows.slice(start, end);
    rows = this.fixParents(rows);
    const disableDeleteAll = true;
    this.setState({ rows, pageNumber, totalRows, disableDeleteAll });
  };

  handleDeleteConfirm = () => {
    this.doDeleteList();
    this.handleDeleteClose();
  };

  handleDeleteClose = () => {
    this.setState({ deleteOpen: false });
  };

  fixParents = rows => {
    const newRows = [];
    rows.forEach((row, i) => {
      newRows.push(row);
      newRows.push({
        parent: i * 2,
        cells: ['child']
      });
    });
    return newRows;
  };

  onCollapse = (event, rowKey, isOpen) => {
    const { rows } = this.state;
    /**
     * Please do not use rowKey as row index for more complex tables.
     * Rather use some kind of identifier like ID passed with each row.
     */
    rows[rowKey].isOpen = isOpen;
    this.setState({
      rows
    });
  };

  filter = rows => {
    const { chipGroups } = this.state;
    const filters = chipGroups[0].chips;
    return rows.filter(row => {
      if (typeof row.parent !== 'undefined') return false;
      if (filters.length === 0) return true;
      if (filters.every(filter => row.cells[this.getColumn('Name')].indexOf(filter) >= 0)) {
        return true;
      }
      return false;
    });
  };

  deleteFilter = id => {
    const copyOfChipGroups = this.state.chipGroups;
    for (let i = 0; copyOfChipGroups.length > i; i++) {
      const index = copyOfChipGroups[i].chips.indexOf(id);
      if (index !== -1) {
        copyOfChipGroups[i].chips.splice(index, 1);
        this.setState({ chipGroups: copyOfChipGroups });
        this.handleSetPage(1);
      }
    }
  };
  filterAdded = searchValue => {
    const { chipGroups } = this.state;
    chipGroups[0].chips.push(searchValue);
    this.setState({ chipGroups }, () => this.handleSetPage(1));
  };

  onTableAction = (action, data) => {
    const { rows } = this.state;
    if (action === 'Delete selected topics') {
      const deleteList = rows.filter(row => row.cells.length > 1 && row.selected).map(row => row.cells[0]);
      this.setState({ deleteOpen: true, deleteList });
    } else if (action === 'topic created') {
      this.refreshTopicList(data);
    } else if (action === 'switch sort') {
      const { sortBy } = this.state;
      sortBy.direction = sortBy.direction === SortByDirection.asc ? SortByDirection.desc : SortByDirection.asc;
      this.setState({ sortBy }, () => this.handleSetPage(1));
    }
  };

  renderTableBody = () => {
    if (this.state.rows.length > 0)
      return (
        <React.Fragment>
          <TableHeader className="topics-table-header" />
          <TableBody />
        </React.Fragment>
      );
    return <TopicsTableEmpty />;
  };

  render() {
    const { columns, rows, actions, sortBy, serverError, firstLoad } = this.state;
    if (firstLoad) {
      return <TopicsLoading />;
    }
    if (this.allRows.length === 0) {
      return (
        <TopicsEmpty
          handleNewNotification={this.props.handleNewNotification}
          onAction={this.onTableAction}
          service={this.topics_service}
        />
      );
    }
    if (serverError) {
      return <ServerError />;
    }

    return (
      <div id="topicTableWrapper">
        <TopicsToolbar
          filters={this.state.chipGroups}
          totalRows={this.state.totalRows}
          pageNumber={this.state.pageNumber}
          rowsPerPage={this.state.rowsPerPage}
          onAction={this.onTableAction}
          sortBy={this.state.sortBy}
          handleSetPage={this.handleSetPage}
          deleteFilter={this.deleteFilter}
          filterAdded={this.filterAdded}
          service={this.topics_service}
          handleNewNotification={this.props.handleNewNotification}
          disableDeleteAll={this.state.disableDeleteAll}
        />
        <Table
          aria-label="Topics table"
          className="topics-table-table"
          actions={actions}
          onSelect={this.onSelect}
          onCollapse={this.onCollapse}
          sortBy={sortBy}
          onSort={this.onSort}
          rows={rows}
          cells={columns}
        >
          {this.renderTableBody()}
        </Table>
        <DeleteConfirm
          onDeleteConfirm={this.handleDeleteConfirm}
          onDeleteClose={this.handleDeleteClose}
          deleteList={this.state.deleteList}
          isOpen={this.state.deleteOpen}
        />
      </div>
    );
  }
}

export default TopicsTable;
