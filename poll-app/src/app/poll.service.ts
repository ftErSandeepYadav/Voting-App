import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Poll } from './poll.models';

@Injectable({
  providedIn: 'root'
})
export class PollService {
  private baseUrl = 'http://localhost:8080/api/polls';

  constructor(private http: HttpClient) { }
  
  createPoll(poll: Poll):Observable<Poll> {
    return this.http.post<Poll>(`${this.baseUrl}`, poll);
  }

  getPolls(): Observable<Poll[]> {
    return this.http.get<Poll[]>(`${this.baseUrl}`);
  }

  // getPollById(id: number): Observable<Poll> {
  //   return this.http.get<Poll>(`${this.baseUrl}/${id}`);
  // }

  vote(pollId: number, optionIndex: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/vote`, { pollId, optionIndex });
  } 

}
