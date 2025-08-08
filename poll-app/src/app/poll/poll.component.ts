import { Component, OnInit } from '@angular/core';
import { PollService } from '../poll.service'; 
import { Poll } from '../poll.models';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-poll',
  imports: [CommonModule, FormsModule],
  templateUrl: './poll.component.html',
  styleUrl: './poll.component.css'
})
export class PollComponent implements OnInit {
  newPoll: Poll = {
    // id: 0,
    question: '',
    options: [ 
      { voteOption: '', voteCount: 0 }, 
      { voteOption: '', voteCount: 0 } 
    ]
  }
  polls: Poll[] = [];
  constructor(private pollService: PollService) {
  }

  ngOnInit(): void {
    this.loadPolls();
  }

  loadPolls() {
    // Logic to load polls will go here
    this.pollService.getPolls().subscribe({
      next: (data) =>{
        this.polls = data;
      },
      error: (error) => {
        console.error('Error loading polls', error);
      }
    });
  }

  createPoll() {
    const pollToSend = { ...this.newPoll };
    // pollToSend.id = 11; // Ensure id is not sent to the backend

    this.pollService.createPoll(pollToSend).subscribe({
      next: (createdPoll) => {
        this.polls.push(createdPoll);
        this.resetPoll();
      },
      error: (error) => { 
        console.error('Error creating poll', error);
      }
    });
  }

  resetPoll() {
    this.newPoll = {
    // id: 0,
    question: '',
    options: [ 
      { voteOption: '', voteCount: 0 }, 
      { voteOption: '', voteCount: 0 } 
    ]
    }
  }

  vote(pollId: number, optionIndex: number) {
    this.pollService.vote(pollId, optionIndex).subscribe({
      next: () => {
        const poll = this.polls.find(p => p.id === pollId);
        if (poll) {
          poll.options[optionIndex].voteCount++;
        }
      },
      error: (error) => {
        console.error('Error voting', error);
      }
    });
  }

  addOption() {
    this.newPoll.options.push({ voteOption: '', voteCount: 0 });
  }

  removeOption(index: number) {
    if (this.newPoll.options.length > 2) {
      this.newPoll.options.splice(index, 1);
    } else {
      alert('At least two options are required.');
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

}
